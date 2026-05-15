//go:build encore_app

package observability

import (
	"os"
	"strings"

	encore "encore.dev"
	"encore.dev/rlog"
)

func newEncoreLogSink() logSink {
	if !runningUnderEncore() {
		return nil
	}
	return encoreLogSink{}
}

func runningUnderEncore() bool {
	return normalized(os.Getenv("ENCORERUNTIME_NOPANIC")) == ""
}

type encoreLogSink struct{}

func (encoreLogSink) Enabled(logLevel) bool {
	return true
}

func (encoreLogSink) Log(level logLevel, msg string, fields ...any) {
	defer recoverEncoreUnavailable()
	switch level {
	case logLevelDebug:
		rlog.Debug(msg, fields...)
	case logLevelInfo:
		rlog.Info(msg, fields...)
	case logLevelWarn:
		rlog.Warn(msg, fields...)
	case logLevelError:
		rlog.Error(msg, fields...)
	}
}

func recoverEncoreUnavailable() {
	if recovered := recover(); recovered != nil && !isEncoreRuntimeUnavailable(recovered) {
		panic(recovered)
	}
}

func isEncoreRuntimeUnavailable(value any) bool {
	msg, ok := value.(string)
	return ok && strings.Contains(msg, "encore apps must be run using the encore command")
}

func currentEncoreTrace() *encoreTraceData {
	req := currentEncoreRequest()
	if req == nil || req.Trace == nil {
		return nil
	}
	return &encoreTraceData{
		TraceID:      req.Trace.TraceID,
		SpanID:       req.Trace.SpanID,
		ParentSpanID: req.Trace.ParentSpanID,
		Recorded:     req.Trace.Recorded,
	}
}

func currentEncoreRequest() (req *encore.Request) {
	defer recoverEncoreUnavailable()
	return encore.CurrentRequest()
}
