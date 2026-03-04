/**
 * Circuit Breaker -- Prevents cascading failures when LLM providers are down.
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Provider is failing, requests are immediately rejected
 * - HALF_OPEN: Testing if provider has recovered (allows one probe request)
 *
 * Configurable per provider with:
 * - Failure threshold (how many failures before opening)
 * - Reset timeout (how long to wait before trying again)
 * - Success threshold (how many successes in half-open before closing)
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. Default: 3. */
  failureThreshold?: number;
  /** Milliseconds to wait before moving from OPEN to HALF_OPEN. Default: 30000 (30s). */
  resetTimeoutMs?: number;
  /** Number of successes in HALF_OPEN before moving back to CLOSED. Default: 1. */
  successThreshold?: number;
}

export interface CircuitStatus {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  totalFailures: number;
  totalSuccesses: number;
}

export interface CircuitBreakerEvent {
  provider: string;
  previousState: CircuitState;
  newState: CircuitState;
  timestamp: Date;
}

export type CircuitBreakerListener = (event: CircuitBreakerEvent) => void;

// ── Circuit Breaker ─────────────────────────────────────────────────────────

export class CircuitBreaker {
  private circuits: Map<string, CircuitData> = new Map();
  private defaultConfig: Required<CircuitBreakerConfig>;
  private listeners: CircuitBreakerListener[] = [];

  constructor(defaultConfig?: CircuitBreakerConfig) {
    this.defaultConfig = {
      failureThreshold: defaultConfig?.failureThreshold ?? 3,
      resetTimeoutMs: defaultConfig?.resetTimeoutMs ?? 30_000,
      successThreshold: defaultConfig?.successThreshold ?? 1,
    };
  }

  /**
   * Check if a request to the given provider is allowed.
   *
   * @returns true if the request should proceed, false if the circuit is open.
   */
  canRequest(provider: string): boolean {
    const circuit = this.getOrCreate(provider);
    const now = Date.now();

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open': {
        // Check if reset timeout has elapsed
        const elapsed = now - (circuit.lastFailureTime ?? 0);
        if (elapsed >= this.defaultConfig.resetTimeoutMs) {
          this.transition(circuit, 'half-open');
          return true; // Allow one probe request
        }
        return false;
      }

      case 'half-open':
        // In half-open, we allow requests to test recovery
        return true;
    }
  }

  /**
   * Record a successful request to the given provider.
   */
  recordSuccess(provider: string): void {
    const circuit = this.getOrCreate(provider);
    circuit.totalSuccesses++;

    switch (circuit.state) {
      case 'closed':
        circuit.consecutiveFailures = 0;
        circuit.consecutiveSuccesses++;
        break;

      case 'half-open':
        circuit.consecutiveSuccesses++;
        if (circuit.consecutiveSuccesses >= this.defaultConfig.successThreshold) {
          this.transition(circuit, 'closed');
        }
        break;

      case 'open':
        // Shouldn't happen (requests blocked), but handle gracefully
        break;
    }
  }

  /**
   * Record a failed request to the given provider.
   */
  recordFailure(provider: string): void {
    const circuit = this.getOrCreate(provider);
    circuit.totalFailures++;
    circuit.consecutiveFailures++;
    circuit.consecutiveSuccesses = 0;
    circuit.lastFailureTime = Date.now();

    switch (circuit.state) {
      case 'closed':
        if (circuit.consecutiveFailures >= this.defaultConfig.failureThreshold) {
          this.transition(circuit, 'open');
        }
        break;

      case 'half-open':
        // Any failure in half-open immediately opens the circuit
        this.transition(circuit, 'open');
        break;

      case 'open':
        // Already open, just track the failure
        break;
    }
  }

  /**
   * Get the current status of a provider's circuit.
   */
  getStatus(provider: string): CircuitStatus {
    const circuit = this.getOrCreate(provider);
    return {
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      consecutiveSuccesses: circuit.consecutiveSuccesses,
      lastFailureTime: circuit.lastFailureTime,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
    };
  }

  /**
   * Get status for all tracked providers.
   */
  getAllStatuses(): Record<string, CircuitStatus> {
    const statuses: Record<string, CircuitStatus> = {};
    for (const [provider] of this.circuits) {
      statuses[provider] = this.getStatus(provider);
    }
    return statuses;
  }

  /**
   * Manually reset a provider's circuit to closed state.
   */
  resetCircuit(provider: string): void {
    const circuit = this.getOrCreate(provider);
    const previous = circuit.state;
    circuit.state = 'closed';
    circuit.consecutiveFailures = 0;
    circuit.consecutiveSuccesses = 0;
    circuit.lastFailureTime = null;

    if (previous !== 'closed') {
      this.emit({ provider, previousState: previous, newState: 'closed', timestamp: new Date() });
    }
  }

  /**
   * Subscribe to circuit state changes.
   */
  onStateChange(listener: CircuitBreakerListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private getOrCreate(provider: string): CircuitData {
    let circuit = this.circuits.get(provider);
    if (!circuit) {
      circuit = {
        provider,
        state: 'closed',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        lastFailureTime: null,
        totalFailures: 0,
        totalSuccesses: 0,
      };
      this.circuits.set(provider, circuit);
    }
    return circuit;
  }

  private transition(circuit: CircuitData, newState: CircuitState): void {
    const previousState = circuit.state;
    circuit.state = newState;

    if (newState === 'closed') {
      circuit.consecutiveFailures = 0;
      circuit.consecutiveSuccesses = 0;
    }

    if (newState === 'half-open') {
      circuit.consecutiveSuccesses = 0;
    }

    this.emit({
      provider: circuit.provider,
      previousState,
      newState,
      timestamp: new Date(),
    });
  }

  private emit(event: CircuitBreakerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not crash the breaker
      }
    }
  }
}

// ── Internal State ──────────────────────────────────────────────────────────

interface CircuitData {
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number | null;
  totalFailures: number;
  totalSuccesses: number;
}
