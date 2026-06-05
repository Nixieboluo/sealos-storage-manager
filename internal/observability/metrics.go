package observability

import "sync"

type HTTPLabels struct {
	Method      string
	Route       string
	StatusClass string
}

type OperationLabels struct {
	Operation string
	Result    string
}

type OperationErrorLabels struct {
	Operation string
}

type KubernetesLabels struct {
	Operation string
	Resource  string
	Result    string
}

type KubernetesErrorLabels struct {
	Operation string
	Resource  string
}

type EventLabels struct {
	Event string
}

type FileBrowserLoginLabels struct {
	Result string
}

type Metrics struct {
	httpRequests        mirroredCounterGroup[HTTPLabels]
	operationRequests   mirroredCounterGroup[OperationLabels]
	operationDurationMS mirroredCounterGroup[OperationLabels]
	operationErrors     mirroredCounterGroup[OperationErrorLabels]
	kubernetesRequests  mirroredCounterGroup[KubernetesLabels]
	kubernetesDuration  mirroredCounterGroup[KubernetesLabels]
	kubernetesErrors    mirroredCounterGroup[KubernetesErrorLabels]
	viewerSessionEvents mirroredCounterGroup[EventLabels]
	podSessionEvents    mirroredCounterGroup[EventLabels]
	authRequestEvents   mirroredCounterGroup[EventLabels]
	fileBrowserLogins   mirroredCounterGroup[FileBrowserLoginLabels]
	cleanupDeleted      mirroredCounter
}

type Counter interface {
	Add(delta uint64)
	Increment()
}

type CounterGroup[L comparable] interface {
	With(labels L) Counter
}

type MetricSources struct {
	HTTPRequests        CounterGroup[HTTPLabels]
	OperationRequests   CounterGroup[OperationLabels]
	OperationDurationMS CounterGroup[OperationLabels]
	OperationErrors     CounterGroup[OperationErrorLabels]
	KubernetesRequests  CounterGroup[KubernetesLabels]
	KubernetesDuration  CounterGroup[KubernetesLabels]
	KubernetesErrors    CounterGroup[KubernetesErrorLabels]
	ViewerSessionEvents CounterGroup[EventLabels]
	PodSessionEvents    CounterGroup[EventLabels]
	AuthRequestEvents   CounterGroup[EventLabels]
	FileBrowserLogins   CounterGroup[FileBrowserLoginLabels]
	CleanupDeleted      Counter
}

type localCounter struct {
	mu    sync.Mutex
	value uint64
}

func (c *localCounter) Add(delta uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.value += delta
}

func (c *localCounter) Increment() {
	c.Add(1)
}

func (c *localCounter) Value() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.value
}

type localCounterGroup[L comparable] struct {
	mu     sync.Mutex
	values map[L]*localCounter
}

func newLocalCounterGroup[L comparable]() *localCounterGroup[L] {
	return &localCounterGroup[L]{values: map[L]*localCounter{}}
}

func (g *localCounterGroup[L]) With(labels L) Counter {
	g.mu.Lock()
	defer g.mu.Unlock()
	if counter, ok := g.values[labels]; ok {
		return counter
	}
	counter := &localCounter{}
	g.values[labels] = counter
	return counter
}

func (g *localCounterGroup[L]) Values() map[L]uint64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make(map[L]uint64, len(g.values))
	for labels, counter := range g.values {
		out[labels] = counter.Value()
	}
	return out
}

type mirroredCounter struct {
	encore Counter
	local  Counter
}

func (c mirroredCounter) Add(delta uint64) {
	if c.encore != nil {
		c.encore.Add(delta)
	}
	c.local.Add(delta)
}

func (c mirroredCounter) Increment() {
	c.Add(1)
}

func (c mirroredCounter) Value() uint64 {
	local, ok := c.local.(*localCounter)
	if !ok {
		return 0
	}
	return local.Value()
}

type mirroredCounterGroup[L comparable] struct {
	encore CounterGroup[L]
	local  *localCounterGroup[L]
}

func (g mirroredCounterGroup[L]) With(labels L) Counter {
	var encoreCounter Counter
	if g.encore != nil {
		encoreCounter = g.encore.With(labels)
	}
	return mirroredCounter{
		encore: encoreCounter,
		local:  g.local.With(labels),
	}
}

func (g mirroredCounterGroup[L]) Values() map[L]uint64 {
	return g.local.Values()
}

func newMirroredCounter(encore Counter) mirroredCounter {
	return mirroredCounter{
		encore: encore,
		local:  &localCounter{},
	}
}

func newMirroredCounterGroup[L comparable](encore CounterGroup[L]) mirroredCounterGroup[L] {
	return mirroredCounterGroup[L]{
		encore: encore,
		local:  newLocalCounterGroup[L](),
	}
}

func newMetrics(sources MetricSources) *Metrics {
	return &Metrics{
		httpRequests:        newMirroredCounterGroup[HTTPLabels](sources.HTTPRequests),
		operationRequests:   newMirroredCounterGroup[OperationLabels](sources.OperationRequests),
		operationDurationMS: newMirroredCounterGroup[OperationLabels](sources.OperationDurationMS),
		operationErrors:     newMirroredCounterGroup[OperationErrorLabels](sources.OperationErrors),
		kubernetesRequests:  newMirroredCounterGroup[KubernetesLabels](sources.KubernetesRequests),
		kubernetesDuration:  newMirroredCounterGroup[KubernetesLabels](sources.KubernetesDuration),
		kubernetesErrors:    newMirroredCounterGroup[KubernetesErrorLabels](sources.KubernetesErrors),
		viewerSessionEvents: newMirroredCounterGroup[EventLabels](sources.ViewerSessionEvents),
		podSessionEvents:    newMirroredCounterGroup[EventLabels](sources.PodSessionEvents),
		authRequestEvents:   newMirroredCounterGroup[EventLabels](sources.AuthRequestEvents),
		fileBrowserLogins:   newMirroredCounterGroup[FileBrowserLoginLabels](sources.FileBrowserLogins),
		cleanupDeleted:      newMirroredCounter(sources.CleanupDeleted),
	}
}
