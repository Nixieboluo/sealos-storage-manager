GO ?= go
GOLANGCI_LINT ?= golangci-lint
GOVULNCHECK ?= govulncheck
ENCORE ?= encore
CONFIG ?= config/viewer.yaml
IMAGE ?= sealos-storage-manager-viewer:dev

.PHONY: fmt fmt-check lint vet test test-race test-integration security build-image verify tidy

fmt:
	$(GO) fmt ./...

fmt-check:
	@test -z "$$($(GO) fmt ./...)" || (echo "gofmt changed files; run make fmt" && exit 1)

lint:
	$(GOLANGCI_LINT) run ./...

vet:
	$(GO) vet ./...

test:
	$(GO) test ./...

test-race:
	$(GO) test -race ./...

test-integration:
	$(GO) test -tags=integration ./... -config $(CONFIG) -count=1

security:
	$(GOVULNCHECK) ./...

build-image:
	$(ENCORE) build docker --config=infra-config.json $(IMAGE)

tidy:
	$(GO) mod tidy

verify: fmt-check vet test test-race
