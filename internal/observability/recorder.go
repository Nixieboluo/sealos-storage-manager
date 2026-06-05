package observability

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/nixieboluo/sealos-storage-manager/internal/config"
)

type traceSink interface {
	Start(ctx context.Context, name string, attrs []slog.Attr) (context.Context, func(error))
	Shutdown(ctx context.Context) error
}

type logSink interface {
	Enabled(level logLevel) bool
	Log(level logLevel, msg string, fields ...any)
}

type Recorder struct {
	logger  *Logger
	metrics *Metrics
	traces  traceSink
}

type options struct {
	metrics MetricSources
	traces  traceSink
}

type Option func(*options)

func WithMetrics(metrics MetricSources) Option {
	return func(opts *options) {
		opts.metrics = metrics
	}
}

func WithTraceSink(traces traceSink) Option {
	return func(opts *options) {
		opts.traces = traces
	}
}

func New(
	ctx context.Context,
	cfg config.ObservabilityConfig,
	out io.Writer,
	opts ...Option,
) (*Recorder, error) {
	options := options{}
	for _, opt := range opts {
		opt(&options)
	}
	logger, err := newLogger(cfg, out)
	if err != nil {
		return nil, err
	}
	traces := options.traces
	if traces == nil {
		traces, err = newTraceSink(ctx, cfg)
		if err != nil {
			return nil, err
		}
	}
	return &Recorder{
		logger:  logger,
		metrics: newMetrics(options.metrics),
		traces:  traces,
	}, nil
}

func MustNew(cfg config.ObservabilityConfig, out io.Writer) *Recorder {
	recorder, err := New(context.Background(), cfg, out)
	if err != nil {
		panic(err)
	}
	return recorder
}

func (r *Recorder) Shutdown(ctx context.Context) error {
	if r == nil || r.traces == nil {
		return nil
	}
	return r.traces.Shutdown(ctx)
}

func (r *Recorder) Logger() *Logger {
	return r.logger
}

// TraceOperation records operation boundary logs into Encore's active trace.
func (r *Recorder) TraceOperation(ctx context.Context, name string, attrs ...slog.Attr) (context.Context, func(error)) {
	start := time.Now()
	fields := append([]slog.Attr{slog.String("operation", name)}, attrs...)
	finishTrace := func(error) {}
	if r.traces != nil {
		ctx, finishTrace = r.traces.Start(ctx, name, attrs)
	}
	r.Logger().LogAttrs(ctx, slog.LevelDebug, "operation.start", fields...)
	return ctx, func(err error) {
		duration := time.Since(start)
		finishTrace(err)
		result := "success"
		if err != nil {
			result = "error"
			r.metrics.operationErrors.With(OperationErrorLabels{Operation: name}).Increment()
		}
		r.metrics.operationRequests.With(OperationLabels{Operation: name, Result: result}).Increment()
		r.metrics.operationDurationMS.With(OperationLabels{Operation: name, Result: result}).
			Add(durationMilliseconds(duration))
		endFields := append([]slog.Attr{}, fields...)
		endFields = append(endFields,
			slog.String("result", result),
			slog.Duration("duration", duration),
		)
		if err != nil {
			endFields = append(endFields, slog.String("error", err.Error()))
			r.Logger().LogAttrs(ctx, slog.LevelWarn, "operation.end", endFields...)
			return
		}
		r.Logger().LogAttrs(ctx, slog.LevelInfo, "operation.end", endFields...)
	}
}

func (r *Recorder) ObserveHTTP(ctx context.Context, method string, route string, status int, duration time.Duration) {
	r.metrics.httpRequests.With(HTTPLabels{
		Method:      method,
		Route:       route,
		StatusClass: statusClass(status),
	}).Increment()
	r.Logger().InfoContext(ctx, "http.request",
		slog.String("method", method),
		slog.String("route", route),
		slog.Int("status", status),
		slog.Duration("duration", duration),
	)
}

func (r *Recorder) ObserveKubernetes(
	operation string,
	resource string,
	err error,
	duration time.Duration,
) {
	result := "success"
	if err != nil {
		result = "error"
		r.metrics.kubernetesErrors.With(KubernetesErrorLabels{
			Operation: operation,
			Resource:  resource,
		}).Increment()
	}
	labels := KubernetesLabels{
		Operation: operation,
		Resource:  resource,
		Result:    result,
	}
	r.metrics.kubernetesRequests.With(labels).Increment()
	r.metrics.kubernetesDuration.With(labels).Add(durationMilliseconds(duration))
}

func (r *Recorder) ObserveViewerSession(event string) {
	r.metrics.viewerSessionEvents.With(EventLabels{Event: event}).Increment()
}

func (r *Recorder) ObservePodSession(event string) {
	r.metrics.podSessionEvents.With(EventLabels{Event: event}).Increment()
}

func (r *Recorder) ObserveAuthRequest(event string) {
	r.metrics.authRequestEvents.With(EventLabels{Event: event}).Increment()
}

func (r *Recorder) ObserveFileBrowserLogin(result string) {
	r.metrics.fileBrowserLogins.With(FileBrowserLoginLabels{Result: result}).Increment()
}

func (r *Recorder) ObserveCleanupDeleted() {
	r.metrics.cleanupDeleted.Increment()
}

func (r *Recorder) WritePrometheus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	r.writeLocalPrometheus(w)
}
