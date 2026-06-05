package observability

import (
	"fmt"
	"strings"
	"time"
)

func statusClass(status int) string {
	if status < 100 {
		return "unknown"
	}
	return fmt.Sprintf("%dxx", status/100)
}

func durationMilliseconds(duration time.Duration) uint64 {
	ms := duration.Milliseconds()
	if ms > 0 {
		return uint64(ms)
	}
	return 1
}

func normalized(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
