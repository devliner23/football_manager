// services/mathModels.js
//
// Reusable statistical/graph primitives used to make GameSimulationEngine
// more accurate and more "alive" over the course of a simulated game:
//
//   1. MarkovChain            – play-calling as a 1st-order Markov process,
//                               with Dirichlet (Bayesian) posterior updates
//                               so the offense's tendencies drift based on
//                               what has actually worked/failed in-game.
//
//   2. WeightedDirectedGraph  – generic graph with weighted edges. Used for
//                               (a) the passing network (who feeds whom) and
//                               (b) defensive matchup assignment.
//
//   3. BetaBayesianRate       – Beta-Bernoulli conjugate model. Used to track
//                               a player's "true" make-rate per shot zone and
//                               update it after every attempt (hot/cold
//                               streaks emerge naturally instead of being
//                               hard-coded).
//
// All classes are framework-free and have no dependency on gameData.json,
// so they can be unit tested in isolation.

'use strict';

// ───────────────────────────── Markov Chain ────────────────────────────────
class MarkovChain {
  /**
   * @param {string[]} states - e.g. ['isolation','pick_and_roll',...]
   * @param {Object} priorCounts - optional {fromState: {toState: pseudoCount}}
   *                               Acts as the Dirichlet prior (alpha).
   */
  constructor(states, priorCounts = {}) {
    this.states = states;
    // counts[from][to] = alpha_i  (Dirichlet pseudo-counts)
    this.counts = {};
    for (const s of states) {
      this.counts[s] = {};
      for (const t of states) {
        this.counts[s][t] = (priorCounts[s] && priorCounts[s][t]) || 1; // weak uniform prior
      }
    }
  }

  /** Bayesian update: observing a transition from -> to increases belief mass. */
  update(from, to, weight = 1) {
    if (!this.counts[from]) this.counts[from] = {};
    if (this.counts[from][to] === undefined) this.counts[from][to] = 1;
    this.counts[from][to] += weight;
  }

  /** Reward/punish a transition without it necessarily having just occurred
   *  (e.g. increase weight of 'pick_and_roll' after it scores, even beyond
   *  the raw occurrence count) — this is what lets outcomes, not just play
   *  calls, shape future tendencies. */
  reinforce(from, to, delta) {
    if (!this.counts[from]) return;
    this.counts[from][to] = Math.max(0.01, (this.counts[from][to] || 1) + delta);
  }

  /** Posterior mean transition probabilities from a given state. */
  distribution(from, biasFn = null) {
    const row = this.counts[from] || this.counts[this.states[0]];
    const entries = Object.entries(row);
    let total = entries.reduce((s, [, v]) => s + v, 0);
    const dist = {};
    for (const [to, v] of entries) {
      let p = v / total;
      if (biasFn) p *= biasFn(to);
      dist[to] = p;
    }
    // renormalize after any bias
    const norm = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
    for (const k of Object.keys(dist)) dist[k] /= norm;
    return dist;
  }

  /** Sample the next state given the current one. */
  sample(from, biasFn = null) {
    const dist = this.distribution(from, biasFn);
    let r = Math.random();
    for (const [to, p] of Object.entries(dist)) {
      r -= p;
      if (r <= 0) return to;
    }
    return this.states[this.states.length - 1];
  }
}

// ───────────────────────── Weighted Directed Graph ─────────────────────────
class WeightedDirectedGraph {
  constructor() {
    this.adj = new Map(); // nodeId -> Map(neighborId -> weight)
  }

  addNode(id) {
    if (!this.adj.has(id)) this.adj.set(id, new Map());
  }

  setEdge(from, to, weight) {
    this.addNode(from);
    this.addNode(to);
    this.adj.get(from).set(to, Math.max(0, weight));
  }

  addToEdge(from, to, delta) {
    this.addNode(from);
    this.addNode(to);
    const cur = this.adj.get(from).get(to) || 0;
    this.adj.get(from).set(to, Math.max(0, cur + delta));
  }

  neighbors(from) {
    return [...(this.adj.get(from) || new Map()).entries()];
  }

  /** Weighted random walk of `steps` hops starting at `start`. Returns the
   *  path taken (array of node ids), used e.g. to model ball movement
   *  through a possession before a shot is taken. */
  randomWalk(start, steps, allowRevisit = true) {
    const path = [start];
    let current = start;
    for (let i = 0; i < steps; i++) {
      let edges = this.neighbors(current);
      if (!allowRevisit) edges = edges.filter(([id]) => !path.includes(id));
      if (edges.length === 0) break;
      const total = edges.reduce((s, [, w]) => s + w, 0);
      if (total <= 0) break;
      let r = Math.random() * total;
      let next = edges[edges.length - 1][0];
      for (const [id, w] of edges) {
        r -= w;
        if (r <= 0) { next = id; break; }
      }
      path.push(next);
      current = next;
    }
    return path;
  }

  /** Weighted-random single hop (used for one-step "who gets the pass"). */
  step(from) {
    const edges = this.neighbors(from);
    if (edges.length === 0) return null;
    const total = edges.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of edges) {
      r -= w;
      if (r <= 0) return id;
    }
    return edges[edges.length - 1][0];
  }

  /** Simple stationary-distribution approximation via power iteration.
   *  Useful for "who is the true offensive hub" over a whole game. */
  stationaryDistribution(iterations = 50) {
    const nodes = [...this.adj.keys()];
    if (nodes.length === 0) return {};
    let dist = {};
    for (const n of nodes) dist[n] = 1 / nodes.length;

    for (let it = 0; it < iterations; it++) {
      const next = {};
      for (const n of nodes) next[n] = 0;
      for (const n of nodes) {
        const edges = this.neighbors(n);
        const total = edges.reduce((s, [, w]) => s + w, 0);
        if (total <= 0) {
          // dangling node: distribute uniformly
          for (const m of nodes) next[m] += dist[n] / nodes.length;
          continue;
        }
        for (const [to, w] of edges) {
          next[to] += dist[n] * (w / total);
        }
      }
      dist = next;
    }
    return dist;
  }
}

// ───────────────────────── Beta-Bayesian Shot Model ─────────────────────────
class BetaBayesianRate {
  /**
   * @param {number} priorAlpha - prior makes (pseudo-observations)
   * @param {number} priorBeta  - prior misses (pseudo-observations)
   */
  constructor(priorAlpha = 5, priorBeta = 5) {
    this.alpha = priorAlpha;
    this.beta = priorBeta;
  }

  /** Posterior mean make probability. */
  mean() {
    return this.alpha / (this.alpha + this.beta);
  }

  /** Posterior variance – shrinks as more attempts accumulate, giving a
   *  natural measure of confidence/sample-size that can widen or narrow
   *  variance in outcomes. */
  variance() {
    const a = this.alpha, b = this.beta;
    return (a * b) / (((a + b) ** 2) * (a + b + 1));
  }

  /** Update after observing a make/miss. */
  update(made) {
    if (made) this.alpha += 1;
    else this.beta += 1;
  }

  /** Draw a sample rate from the posterior (adds appropriate game-to-game
   *  variance instead of always using the flat posterior mean). Uses a
   *  simple Beta sampler via two Gamma draws (Marsaglia-Tsang-ish, adequate
   *  for our alpha/beta ranges). */
  sample() {
    const gamma = (shape) => {
      // Marsaglia & Tsang method (shape >= 1 assumed here since alpha/beta stay >=1)
      if (shape < 1) {
        // boost and correct
        const u = Math.random();
        return gamma(1 + shape) * Math.pow(u, 1 / shape);
      }
      const d = shape - 1 / 3;
      const c = 1 / Math.sqrt(9 * d);
      while (true) {
        let x, v;
        do {
          const u1 = Math.random();
          const u2 = Math.random();
          x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) {
          return d * v;
        }
      }
    };
    const ga = gamma(this.alpha);
    const gb = gamma(this.beta);
    return ga / (ga + gb);
  }
}

/** Registry that lazily creates and stores one BetaBayesianRate per
 *  (playerId, zone) pair, seeded from that player's rating so early-game
 *  behaviour still reflects scouting/attributes, not a blank slate. */
class PlayerShotModelRegistry {
  constructor() {
    this.models = new Map(); // key `${playerId}:${zone}` -> BetaBayesianRate
  }

  _key(playerId, zone) {
    return `${playerId}:${zone}`;
  }

  _seedFromRating(rating) {
    // Convert a 0-99 rating into a Beta prior with modest confidence
    // (~14 pseudo-observations total), centered on a plausible make rate.
    const impliedRate = Math.min(0.85, Math.max(0.15, rating / 130));
    const totalPseudo = 14;
    const alpha = Math.max(1, impliedRate * totalPseudo);
    const beta = Math.max(1, totalPseudo - alpha);
    return new BetaBayesianRate(alpha, beta);
  }

  get(playerId, zone, ratingForSeed) {
    const key = this._key(playerId, zone);
    if (!this.models.has(key)) {
      this.models.set(key, this._seedFromRating(ratingForSeed ?? 60));
    }
    return this.models.get(key);
  }

  update(playerId, zone, ratingForSeed, made) {
    this.get(playerId, zone, ratingForSeed).update(made);
  }
}

module.exports = {
  MarkovChain,
  WeightedDirectedGraph,
  BetaBayesianRate,
  PlayerShotModelRegistry,
};