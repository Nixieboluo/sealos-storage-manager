package session

import (
	"maps"
	"sort"
	"strings"

	storagev1 "k8s.io/api/storage/v1"
)

func describeStorageClass(storageClass storagev1.StorageClass) string {
	item := StorageClassToDomain(storageClass)
	lines := []string{
		"Name: " + storageClass.Name,
		"Provisioner: " + storageClass.Provisioner,
		"Default: " + boolText(item.IsDefault),
		"Reclaim Policy: " + item.ReclaimPolicy,
		"Volume Binding Mode: " + item.VolumeBindingMode,
		"Allow Volume Expansion: " + boolText(item.AllowVolumeExpansion),
		"Creation Timestamp: " + item.CreationTimestampRFC3339,
		"",
		"Parameters:",
	}
	lines = appendMap(lines, storageClass.Parameters)
	lines = append(lines, "", "Mount Options:")
	if len(storageClass.MountOptions) == 0 {
		lines = append(lines, "  <none>")
	} else {
		for _, option := range storageClass.MountOptions {
			lines = append(lines, "  - "+option)
		}
	}
	lines = append(lines, "", "Annotations:")
	lines = appendMap(lines, storageClass.Annotations)
	return strings.Join(lines, "\n")
}

func appendMap(lines []string, values map[string]string) []string {
	if len(values) == 0 {
		return append(lines, "  <none>")
	}
	cloned := maps.Clone(values)
	keys := make([]string, 0, len(cloned))
	for key := range cloned {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		lines = append(lines, "  "+key+": "+cloned[key])
	}
	return lines
}

func boolText(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
