package session

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

func newID(prefix string) (string, error) {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generating id: %w", err)
	}
	return prefix + "_" + hex.EncodeToString(raw[:]), nil
}
