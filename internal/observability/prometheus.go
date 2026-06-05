package observability

import (
	"fmt"
	"io"
	"sort"
	"strings"
)

func (r *Recorder) writeLocalPrometheus(w io.Writer) {
	_, _ = io.WriteString(w, "# Metrics are mirrored locally for /metrics and exported by the Encore runtime according to infra-config.json.\n")
	writeLocalGroup(w, "viewer_http_route_requests_total", r.metrics.httpRequests.Values(), func(labels HTTPLabels) string {
		return prometheusLabels("Method", labels.Method, "Route", labels.Route, "StatusClass", labels.StatusClass)
	})
	writeLocalGroup(w, "viewer_operation_requests_total", r.metrics.operationRequests.Values(), func(labels OperationLabels) string {
		return prometheusLabels("Operation", labels.Operation, "Result", labels.Result)
	})
	writeLocalGroup(w, "viewer_operation_duration_milliseconds_total", r.metrics.operationDurationMS.Values(), func(labels OperationLabels) string {
		return prometheusLabels("Operation", labels.Operation, "Result", labels.Result)
	})
	writeLocalGroup(w, "viewer_operation_errors_total", r.metrics.operationErrors.Values(), func(labels OperationErrorLabels) string {
		return prometheusLabels("Operation", labels.Operation)
	})
	writeLocalGroup(w, "viewer_kubernetes_operation_requests_total", r.metrics.kubernetesRequests.Values(), func(labels KubernetesLabels) string {
		return prometheusLabels("Operation", labels.Operation, "Resource", labels.Resource, "Result", labels.Result)
	})
	writeLocalGroup(w, "viewer_kubernetes_operation_duration_milliseconds_total", r.metrics.kubernetesDuration.Values(), func(labels KubernetesLabels) string {
		return prometheusLabels("Operation", labels.Operation, "Resource", labels.Resource, "Result", labels.Result)
	})
	writeLocalGroup(w, "viewer_kubernetes_operation_errors_total", r.metrics.kubernetesErrors.Values(), func(labels KubernetesErrorLabels) string {
		return prometheusLabels("Operation", labels.Operation, "Resource", labels.Resource)
	})
	writeLocalGroup(w, "viewer_session_events_total", r.metrics.viewerSessionEvents.Values(), func(labels EventLabels) string {
		return prometheusLabels("Event", labels.Event)
	})
	writeLocalGroup(w, "viewer_pod_session_events_total", r.metrics.podSessionEvents.Values(), func(labels EventLabels) string {
		return prometheusLabels("Event", labels.Event)
	})
	writeLocalGroup(w, "viewer_auth_request_events_total", r.metrics.authRequestEvents.Values(), func(labels EventLabels) string {
		return prometheusLabels("Event", labels.Event)
	})
	writeLocalGroup(w, "viewer_filebrowser_logins_total", r.metrics.fileBrowserLogins.Values(), func(labels FileBrowserLoginLabels) string {
		return prometheusLabels("Result", labels.Result)
	})
	if value := r.metrics.cleanupDeleted.Value(); value > 0 {
		_, _ = fmt.Fprintf(w, "viewer_cleanup_deleted_total %d\n", value)
	}
}

func writeLocalGroup[L comparable](
	w io.Writer,
	name string,
	values map[L]uint64,
	labels func(L) string,
) {
	lines := make([]string, 0, len(values))
	for labelSet, value := range values {
		if value == 0 {
			continue
		}
		lines = append(lines, fmt.Sprintf("%s%s %d\n", name, labels(labelSet), value))
	}
	sort.Strings(lines)
	for _, line := range lines {
		_, _ = io.WriteString(w, line)
	}
}

func prometheusLabels(pairs ...string) string {
	if len(pairs) == 0 {
		return ""
	}
	parts := make([]string, 0, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		parts = append(parts, fmt.Sprintf(`%s="%s"`, pairs[i], prometheusEscape(pairs[i+1])))
	}
	return "{" + strings.Join(parts, ",") + "}"
}

func prometheusEscape(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\n", `\n`)
	return value
}
