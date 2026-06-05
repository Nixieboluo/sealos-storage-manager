package session

import (
	"fmt"

	"github.com/nixieboluo/sealos-storage-manager/internal/domain"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
)

var viewerIngressCORSAnnotations = map[string]string{
	"nginx.ingress.kubernetes.io/enable-cors":             "true",
	"nginx.ingress.kubernetes.io/cors-allow-origin":       "*",
	"nginx.ingress.kubernetes.io/cors-allow-credentials":  "false",
	"nginx.ingress.kubernetes.io/cors-allow-methods":      "GET, PUT, POST, DELETE, PATCH, OPTIONS",
	"nginx.ingress.kubernetes.io/cors-allow-headers":      "Authorization, X-Auth, Content-Type, Cache-Control, Pragma, Tus-Resumable, Upload-Length, Upload-Metadata, Upload-Offset, Upload-Defer-Length, Upload-Concat, Upload-Checksum, X-HTTP-Method-Override",
	"nginx.ingress.kubernetes.io/cors-expose-headers":     "Location, Tus-Resumable, Upload-Offset, Upload-Length, Upload-Metadata, Upload-Defer-Length, Upload-Concat, Upload-Expires",
	"nginx.ingress.kubernetes.io/cors-max-age":            "600",
	"nginx.ingress.kubernetes.io/proxy-body-size":         "0",
	"nginx.ingress.kubernetes.io/proxy-request-buffering": "off",
}

var fileBrowserAllowedIngressPaths = []string{
	"/api/login",
	"/api/raw",
	"/api/resources",
	"/api/tus",
	"/api/usage",
}

func (s *PodService) buildPod(session *domain.PodSession, mountInfo *domain.PVCMountInfo) *corev1.Pod {
	readOnly := session.Mode == domain.ModeReadOnly
	labels := managedLabels(session)
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:   session.Namespace,
			Name:        session.PodName,
			Labels:      labels,
			Annotations: lifecycleAnnotations(session),
		},
		Spec: corev1.PodSpec{
			ServiceAccountName: s.cfg.Viewer.Pod.ServiceAccountName,
			Containers: []corev1.Container{
				{
					Name:    "filebrowser",
					Image:   s.cfg.Viewer.FileBrowser.Image,
					Command: []string{"/bin/sh", "-c"},
					Args: []string{
						shellQuote(s.cfg.Viewer.FileBrowser.BinaryPath) + " config init " +
							"--database " + shellQuote(s.cfg.Viewer.Pod.DatabasePath) + " " +
							"--root " + shellQuote(s.cfg.Viewer.Pod.MountPath) + " " +
							"--address 0.0.0.0 " +
							"--port " + fmt.Sprint(s.cfg.Viewer.FileBrowser.Port) + " " +
							"--auth.method=hook " +
							"--auth.command=/hooks/filebrowser-auth-hook.sh " +
							"--auth.header= " +
							"--token-expiration-time " + shellQuote(s.cfg.Viewer.FileBrowser.TokenTTL.String()) + " " +
							"--disable-exec " +
							"&& exec " + shellQuote(s.cfg.Viewer.FileBrowser.BinaryPath) + " " +
							"--database " + shellQuote(s.cfg.Viewer.Pod.DatabasePath) + " " +
							"--root " + shellQuote(s.cfg.Viewer.Pod.MountPath) + " " +
							"--address 0.0.0.0 " +
							"--port " + fmt.Sprint(s.cfg.Viewer.FileBrowser.Port),
					},
					Ports: []corev1.ContainerPort{{ContainerPort: s.cfg.Viewer.FileBrowser.Port}},
					Env: []corev1.EnvVar{
						{Name: "POD_SESSION_ID", Value: session.ID},
						{Name: "VIEWER_POD_NAME", Value: session.PodName},
						{Name: "BACKEND_VERIFY_URL", Value: s.cfg.Viewer.BackendVerifyURL},
						{Name: "HOOK_CLIENT_TOKEN", Value: s.cfg.Viewer.HookClientToken},
					},
					VolumeMounts: []corev1.VolumeMount{
						{
							Name:      "pvc",
							MountPath: s.cfg.Viewer.Pod.MountPath,
							ReadOnly:  readOnly,
						},
						{
							Name:      "hook",
							MountPath: "/hooks",
							ReadOnly:  true,
						},
					},
					Resources: corev1.ResourceRequirements{
						Requests: resourceList(s.cfg.Viewer.Pod.CPURequest, s.cfg.Viewer.Pod.MemoryRequest),
						Limits:   resourceList(s.cfg.Viewer.Pod.CPULimit, s.cfg.Viewer.Pod.MemoryLimit),
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "pvc",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: session.PVCName,
							ReadOnly:  readOnly,
						},
					},
				},
				{
					Name: "hook",
					VolumeSource: corev1.VolumeSource{
						ConfigMap: &corev1.ConfigMapVolumeSource{
							LocalObjectReference: corev1.LocalObjectReference{
								Name: hookConfigMapName(session),
							},
							DefaultMode: ptrInt32(0o555),
						},
					},
				},
			},
		},
	}
	if session.AccessMode == domain.AccessModeReadWriteOnce && mountInfo != nil && len(mountInfo.Nodes) == 1 {
		pod.Spec.Affinity = &corev1.Affinity{
			NodeAffinity: &corev1.NodeAffinity{
				RequiredDuringSchedulingIgnoredDuringExecution: &corev1.NodeSelector{
					NodeSelectorTerms: []corev1.NodeSelectorTerm{
						{
							MatchExpressions: []corev1.NodeSelectorRequirement{
								{
									Key:      "kubernetes.io/hostname",
									Operator: corev1.NodeSelectorOpIn,
									Values:   []string{mountInfo.Nodes[0]},
								},
							},
						},
					},
				},
			},
		}
	}
	return pod
}

func (s *PodService) buildService(
	session *domain.PodSession,
	owner metav1.OwnerReference,
) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:       session.Namespace,
			Name:            session.ServiceName,
			Labels:          managedLabels(session),
			OwnerReferences: []metav1.OwnerReference{owner},
		},
		Spec: corev1.ServiceSpec{
			Type: corev1.ServiceType(s.cfg.Viewer.Service.Type),
			Selector: map[string]string{
				labelPodSessionID: session.ID,
			},
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       s.cfg.Viewer.Service.Port,
					TargetPort: intstr.FromInt32(s.cfg.Viewer.FileBrowser.Port),
				},
			},
		},
	}
}

func (s *PodService) buildIngress(
	session *domain.PodSession,
	owner metav1.OwnerReference,
) (*networkingv1.Ingress, error) {
	host, err := s.viewerHost(session.ID)
	if err != nil {
		return nil, err
	}
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Namespace:       session.Namespace,
			Name:            session.ServiceName,
			Labels:          managedLabels(session),
			Annotations:     viewerIngressAnnotations(),
			OwnerReferences: []metav1.OwnerReference{owner},
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: &s.cfg.Viewer.Ingress.ClassName,
			Rules: []networkingv1.IngressRule{
				{
					Host: host,
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: s.fileBrowserIngressPaths(session),
						},
					},
				},
			},
		},
	}
	if s.cfg.Viewer.Ingress.TLSSecretName != "" {
		ingress.Spec.TLS = []networkingv1.IngressTLS{
			{
				Hosts:      []string{host},
				SecretName: s.cfg.Viewer.Ingress.TLSSecretName,
			},
		}
	}
	return ingress, nil
}

func (s *PodService) fileBrowserIngressPaths(session *domain.PodSession) []networkingv1.HTTPIngressPath {
	paths := make([]networkingv1.HTTPIngressPath, 0, len(fileBrowserAllowedIngressPaths))
	for _, path := range fileBrowserAllowedIngressPaths {
		paths = append(paths, networkingv1.HTTPIngressPath{
			Path:     path,
			PathType: ptr(networkingv1.PathTypePrefix),
			Backend: networkingv1.IngressBackend{
				Service: &networkingv1.IngressServiceBackend{
					Name: session.ServiceName,
					Port: networkingv1.ServiceBackendPort{
						Number: s.cfg.Viewer.Service.Port,
					},
				},
			},
		})
	}
	return paths
}

func viewerIngressAnnotations() map[string]string {
	annotations := make(map[string]string, len(viewerIngressCORSAnnotations))
	for key, value := range viewerIngressCORSAnnotations {
		annotations[key] = value
	}
	return annotations
}
