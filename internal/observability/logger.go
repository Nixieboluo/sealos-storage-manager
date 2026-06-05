package observability

import (
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/nixieboluo/sealos-storage-manager/internal/config"
)

const (
	exporterDiscard = "discard"
	exporterEncore  = "encore"
	exporterNone    = "none"
	exporterStdout  = "stdout"
)

type Logger struct {
	level logLevel
	sink  logSink
}

type logLevel int

const (
	logLevelDebug logLevel = iota
	logLevelInfo
	logLevelWarn
	logLevelError
)

func newLogger(cfg config.ObservabilityConfig, out io.Writer) (*Logger, error) {
	var level logLevel
	switch normalized(cfg.Logs.Level) {
	case "", "info":
		level = logLevelInfo
	case "debug":
		level = logLevelDebug
	case "warn":
		level = logLevelWarn
	case "error":
		level = logLevelError
	default:
		return nil, fmt.Errorf("unsupported observability.logs.level %q", cfg.Logs.Level)
	}
	if out == nil {
		out = io.Discard
	}
	switch normalized(cfg.Logs.Exporter) {
	case "", exporterEncore:
		return &Logger{level: level, sink: newEncoreLogSink()}, nil
	case exporterStdout:
		return &Logger{level: level, sink: newSlogSink(out)}, nil
	case exporterDiscard, exporterNone:
		return &Logger{level: level, sink: newSlogSink(io.Discard)}, nil
	default:
		return nil, fmt.Errorf("unsupported observability.logs.exporter %q", cfg.Logs.Exporter)
	}
}

func (l *Logger) LogAttrs(ctx context.Context, level slog.Level, msg string, attrs ...slog.Attr) {
	l.log(ctx, fromSlogLevel(level), msg, attrs...)
}

func (l *Logger) InfoContext(ctx context.Context, msg string, args ...any) {
	l.log(ctx, logLevelInfo, msg, argsToAttrs(args)...)
}

func (l *Logger) log(_ context.Context, level logLevel, msg string, attrs ...slog.Attr) {
	if l == nil || l.sink == nil || level < l.level || !l.sink.Enabled(level) {
		return
	}
	l.sink.Log(level, msg, attrsToFields(attrs)...)
}

type slogSink struct {
	logger *slog.Logger
}

func newSlogSink(out io.Writer) slogSink {
	return slogSink{
		logger: slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: slog.LevelDebug})),
	}
}

func (s slogSink) Enabled(_ logLevel) bool {
	return true
}

func (s slogSink) Log(level logLevel, msg string, fields ...any) {
	switch level {
	case logLevelDebug:
		s.logger.Debug(msg, fields...)
	case logLevelInfo:
		s.logger.Info(msg, fields...)
	case logLevelWarn:
		s.logger.Warn(msg, fields...)
	case logLevelError:
		s.logger.Error(msg, fields...)
	}
}

func argsToAttrs(args []any) []slog.Attr {
	attrs := make([]slog.Attr, 0, len(args))
	for _, arg := range args {
		if attr, ok := arg.(slog.Attr); ok {
			attrs = append(attrs, attr)
		}
	}
	return attrs
}

func attrsToFields(attrs []slog.Attr) []any {
	fields := make([]any, 0, len(attrs)*2)
	for _, attr := range attrs {
		attr.Value = attr.Value.Resolve()
		fields = append(fields, attr.Key, attrValue(attr))
	}
	return fields
}

func attrValue(attr slog.Attr) any {
	switch attr.Value.Kind() {
	case slog.KindString:
		return attr.Value.String()
	case slog.KindBool:
		return attr.Value.Bool()
	case slog.KindInt64:
		return attr.Value.Int64()
	case slog.KindUint64:
		return attr.Value.Uint64()
	case slog.KindFloat64:
		return attr.Value.Float64()
	case slog.KindDuration:
		return attr.Value.Duration()
	case slog.KindTime:
		return attr.Value.Time()
	default:
		return attr.Value.Any()
	}
}

func fromSlogLevel(level slog.Level) logLevel {
	switch {
	case level < slog.LevelInfo:
		return logLevelDebug
	case level < slog.LevelWarn:
		return logLevelInfo
	case level < slog.LevelError:
		return logLevelWarn
	default:
		return logLevelError
	}
}
