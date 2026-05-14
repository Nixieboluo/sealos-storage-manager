package tracecontext

import (
	"encore.dev/middleware"
	"github.com/nixieboluo/sealos-storage-manager/internal/observability"
)

//encore:middleware global target=all
func Middleware(req middleware.Request, next middleware.Next) middleware.Response {
	data := req.Data()
	ctx := observability.LinkEncoreTrace(req.Context())
	if data != nil {
		ctx = observability.ExtractTraceContext(ctx, data.Headers)
	}
	return next(req.WithContext(ctx))
}
