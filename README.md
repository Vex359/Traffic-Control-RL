🚦 Traffic Control AI — Reinforcement Learning Simulator

An interactive browser-based **Traffic Signal Control System** trained using **Tabular Q-Learning**.

This project started as a simple traffic-light simulation and evolved into a **learning AI** that adapts to traffic pressure, emergencies (ambulances), and long-term congestion — eventually outperforming fixed-time controllers.

---

📌 Motivation

Most traffic signals operate on *fixed cycles* (e.g., 20s / 30s), which fail under:

* Uneven traffic pressure
* Sudden surges
* Emergency vehicles

The goal was to answer:

> *Can a simple reinforcement learning agent learn to manage traffic better than static rules?*

---

🧠 Project Journey (How it evolved)

1️⃣ Phase 1 — Rule-based Simulation

* Built a 4-way intersection
* 2 opposite signals green at a time (NS / EW)
* Cars spawn randomly and wait at red
* Manual switching & fixed cycles (20s / 30s)

This worked — but was *static and predictable*.

---

2️⃣ Phase 2 — Adding Rewards & Metrics

We introduced a scoring system:

* ➕ Cars passing
* ➖ Cars waiting
* ➖ Phase switching

This allowed us to *measure performance*, but behavior was still hard-coded.

---

3️⃣ Phase 3 — Reinforcement Learning (Q-Learning)

We replaced rules with a *Tabular Q-Learning agent*.

The AI:

* Observes the state of the intersection
* Chooses between actions:

  * `EXTEND` (keep current green)
  * `SWITCH` (change phase)
* Learns via the Bellman equation


Q(s,a) ← Q(s,a) + α [ r + γ max Q(s',a') − Q(s,a) ]


---

4️⃣ State Design (Key Insight)

States are *discretized*, not raw numbers:


PHASE_PRESSURE_EMERGENCY
Example: NS_HIGH_EW_AMB


Where:

* `PHASE` → NS / EW
* `PRESSURE` → BALANCED / HIGH_NS / HIGH_EW
* `EMERGENCY` → NONE / AMB

This kept the state-space small and learnable.

---

5️⃣ Emergency Vehicles (Ambulances)

A major upgrade:

* Ambulances ignore red lights
* Crashes are *heavily penalized*
* Waiting ambulances incur strong negative reward

This forced the AI to *make trade-offs*:

* Delay traffic vs emergency priority
* Switch early vs risk future ambulance arrival

---

6️⃣ Reward Shaping (Most Important Part)

We learned that *bad reward design breaks learning*.

Final tuned rewards:

* Car passed: `+1`
* Car waiting: `-0.1` (waiting is OK, congestion is not)
* Ambulance passed: `+5`
* Ambulance waiting: `-200`
* Ambulance crash: `-500`
* Phase switch: `-0.2`

This change alone improved stability massively.

---

7️⃣ Exploration → Exploitation

* Started with ε-greedy exploration (`ε ≈ 0.05`)
* Gradually reduced exploration  (`ε ≈ 0.02`)
* Final evaluation used:

epsilon = 0; (Since the model reached the optimal level.)


Result: *stable, deterministic policy*.

---

🏆 Results

| Controller       | Avg Reward / sec  |
| ---------------- | ----------------- |
| Fixed 30s        | ~ -28            |
| Fixed 20s        | ~ -27            |
| RL Agent (final) | ~ -25          ✅|

The AI *beats fixed cycles* by adapting to real-time conditions.

---

## 📊 What the Q-Table Shows

* `EXTEND` preferred in low pressure states
* `SWITCH` preferred when emergency present
* Different behavior for NS vs EW

This confirms **policy learning**, not random behavior.

---

## 💾 Saving & Portability

* Q-table is stored during runtime
* Can be exported/imported as JSON
* Allows training on one device and evaluation on another

---

## 🚀 What This Project Demonstrates

* Reinforcement Learning fundamentals
* Reward shaping
* Exploration vs exploitation
* State abstraction
* Real-world trade-offs
* Debugging RL systems

All implemented **entirely in JavaScript**, running in the browser.

---

🧠 Key Takeaway

> The hardest part of RL is **not the algorithm** — it’s designing the environment and rewards.

This project proves that even **simple tabular Q-learning**, when designed carefully, can outperform rigid systems.

---

🏁 Final Notes

This is not a toy demo — it is a *real learning system*.

If extended with:

* multi-intersection grids
* turning lanes
* function approximation (DQN)

…it could scale into a serious traffic optimization model.

GGs.
