//go:build !encore_app

package observability

func newEncoreLogSink() logSink {
	return nil
}

func currentEncoreTrace() *encoreTraceData {
	return nil
}
