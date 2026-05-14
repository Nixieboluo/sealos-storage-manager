package observability

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	encore "encore.dev"
	"github.com/nixieboluo/sealos-storage-manager/internal/config"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

const traceInstrumentationName = "github.com/nixieboluo/sealos-storage-manager/internal/observability"

var tracePropagator = propagation.NewCompositeTextMapPropagator(
	propagation.TraceContext{},
	propagation.Baggage{},
)

type otelTraceSink struct {
	provider *sdktrace.TracerProvider
	tracer   trace.Tracer
}

func newTraceSink(ctx context.Context, cfg config.ObservabilityConfig) (traceSink, error) {
	switch normalized(cfg.Traces.Exporter) {
	case "", exporterNone, exporterDiscard:
		return nil, nil
	case "otlp":
		return newOTLPTraceSink(ctx, cfg)
	default:
		return nil, fmt.Errorf("unsupported observability.traces.exporter %q", cfg.Traces.Exporter)
	}
}

func newOTLPTraceSink(ctx context.Context, cfg config.ObservabilityConfig) (*otelTraceSink, error) {
	exportTimeout := cfg.Traces.ExportTimeout
	if exportTimeout <= 0 {
		exportTimeout = 5 * time.Second
	}
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(strings.TrimSpace(cfg.Traces.Endpoint)),
		otlptracehttp.WithTimeout(exportTimeout),
	)
	if err != nil {
		return nil, fmt.Errorf("creating otlp trace exporter: %w", err)
	}
	sampleRatio := cfg.Traces.SampleRatio
	if sampleRatio < 0 {
		sampleRatio = 0
	}
	if sampleRatio > 1 {
		sampleRatio = 1
	}
	batchTimeout := cfg.Traces.BatchTimeout
	if batchTimeout <= 0 {
		batchTimeout = 5 * time.Second
	}
	res := resource.NewWithAttributes(semconv.SchemaURL, semconv.ServiceName(cfg.ServiceName))
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(sampleRatio))),
		sdktrace.WithBatcher(exporter,
			sdktrace.WithBatchTimeout(batchTimeout),
			sdktrace.WithExportTimeout(exportTimeout),
		),
	)
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(tracePropagator)
	return NewOTelTraceSink(provider), nil
}

func ExtractTraceContext(ctx context.Context, headers http.Header) context.Context {
	return tracePropagator.Extract(ctx, propagation.HeaderCarrier(headers))
}

func LinkEncoreTrace(ctx context.Context) context.Context {
	req := currentEncoreRequest()
	if req == nil || req.Trace == nil {
		return ctx
	}
	parentSpanID := strings.TrimSpace(req.Trace.ParentSpanID)
	if parentSpanID == "" {
		parentSpanID = strings.TrimSpace(req.Trace.SpanID)
	}
	traceID, err := trace.TraceIDFromHex(strings.TrimSpace(req.Trace.TraceID))
	if err != nil {
		return ctx
	}
	spanID, err := trace.SpanIDFromHex(parentSpanID)
	if err != nil {
		return ctx
	}
	flags := trace.TraceFlags(0)
	if req.Trace.Recorded {
		flags = trace.FlagsSampled
	}
	spanContext := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: flags,
		Remote:     true,
	})
	if !spanContext.IsValid() {
		return ctx
	}
	return trace.ContextWithRemoteSpanContext(ctx, spanContext)
}

func currentEncoreRequest() (req *encore.Request) {
	defer recoverEncoreUnavailable()
	return encore.CurrentRequest()
}

func NewOTelTraceSink(provider *sdktrace.TracerProvider) *otelTraceSink {
	if provider == nil {
		return nil
	}
	return &otelTraceSink{
		provider: provider,
		tracer:   provider.Tracer(traceInstrumentationName),
	}
}

func (r *Recorder) OTelTracerProvider() trace.TracerProvider {
	sink, ok := r.traces.(*otelTraceSink)
	if !ok || sink == nil || sink.provider == nil {
		return nil
	}
	return sink.provider
}

func (s *otelTraceSink) Start(ctx context.Context, name string, attrs []slog.Attr) (context.Context, func(error)) {
	if s == nil || s.tracer == nil {
		return ctx, func(error) {}
	}
	start := time.Now()
	spanAttrs := append([]attribute.KeyValue{
		attribute.String("operation.name", name),
	}, slogAttrsToOTel(attrs)...)
	ctx, span := s.tracer.Start(ctx, name,
		trace.WithSpanKind(trace.SpanKindInternal),
		trace.WithAttributes(spanAttrs...),
		trace.WithTimestamp(start),
	)
	return ctx, func(err error) {
		if err != nil {
			span.RecordError(err, trace.WithStackTrace(true))
			span.SetStatus(codes.Error, err.Error())
		}
		span.End(trace.WithTimestamp(time.Now()))
	}
}

func (s *otelTraceSink) Shutdown(ctx context.Context) error {
	if s == nil || s.provider == nil {
		return nil
	}
	return s.provider.Shutdown(ctx)
}

func slogAttrsToOTel(attrs []slog.Attr) []attribute.KeyValue {
	out := make([]attribute.KeyValue, 0, len(attrs))
	for _, attr := range attrs {
		out = appendOTelAttr(out, "", attr)
	}
	return out
}

func appendOTelAttr(out []attribute.KeyValue, prefix string, attr slog.Attr) []attribute.KeyValue {
	if attr.Key == "" {
		return out
	}
	key := attr.Key
	if prefix != "" {
		key = prefix + "." + key
	}
	value := attr.Value.Resolve()
	switch value.Kind() {
	case slog.KindString:
		out = append(out, attribute.String(key, value.String()))
	case slog.KindBool:
		out = append(out, attribute.Bool(key, value.Bool()))
	case slog.KindInt64:
		out = append(out, attribute.Int64(key, value.Int64()))
	case slog.KindUint64:
		out = append(out, attribute.String(key, strconv.FormatUint(value.Uint64(), 10)))
	case slog.KindFloat64:
		out = append(out, attribute.Float64(key, value.Float64()))
	case slog.KindDuration:
		out = append(out, attribute.Int64(key+".milliseconds", otelDurationMilliseconds(value.Duration())))
	case slog.KindTime:
		out = append(out, attribute.String(key, value.Time().Format(time.RFC3339Nano)))
	case slog.KindGroup:
		for _, groupAttr := range value.Group() {
			out = appendOTelAttr(out, key, groupAttr)
		}
	case slog.KindAny:
		out = appendAnyOTelAttr(out, key, value.Any())
	default:
		out = append(out, attribute.String(key, value.String()))
	}
	return out
}

func appendAnyOTelAttr(out []attribute.KeyValue, key string, value any) []attribute.KeyValue {
	switch typed := value.(type) {
	case nil:
		return out
	case string:
		out = append(out, attribute.String(key, typed))
	case bool:
		out = append(out, attribute.Bool(key, typed))
	case int:
		out = append(out, attribute.Int(key, typed))
	case int8:
		out = append(out, attribute.Int64(key, int64(typed)))
	case int16:
		out = append(out, attribute.Int64(key, int64(typed)))
	case int32:
		out = append(out, attribute.Int64(key, int64(typed)))
	case int64:
		out = append(out, attribute.Int64(key, typed))
	case uint:
		out = append(out, attribute.String(key, strconv.FormatUint(uint64(typed), 10)))
	case uint8:
		out = append(out, attribute.Int64(key, int64(typed)))
	case uint16:
		out = append(out, attribute.Int64(key, int64(typed)))
	case uint32:
		out = append(out, attribute.Int64(key, int64(typed)))
	case uint64:
		out = append(out, attribute.String(key, strconv.FormatUint(typed, 10)))
	case float32:
		out = append(out, attribute.Float64(key, float64(typed)))
	case float64:
		if !math.IsNaN(typed) && !math.IsInf(typed, 0) {
			out = append(out, attribute.Float64(key, typed))
		}
	case time.Duration:
		out = append(out, attribute.Int64(key+".milliseconds", otelDurationMilliseconds(typed)))
	case time.Time:
		out = append(out, attribute.String(key, typed.Format(time.RFC3339Nano)))
	case fmt.Stringer:
		out = append(out, attribute.String(key, typed.String()))
	default:
		out = append(out, attribute.String(key, fmt.Sprint(typed)))
	}
	return out
}

func otelDurationMilliseconds(duration time.Duration) int64 {
	ms := duration.Milliseconds()
	if ms > 0 {
		return ms
	}
	return 1
}
