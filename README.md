# EMD Processing System

## Introduction

The **EMD Processing System** is a modern, web-based application built with **Next.js** to support the operational handling, review, and monitoring of **Electronic Miscellaneous Documents (EMDs)** in an airline ticketing environment.

The project is designed to streamline EMD workflows by providing:

- Clear visibility of EMD and PNR statuses across queues
- Actionable dashboards for agents and supervisors
- Human-in-the-loop support for exception handling and AI-assisted decisions
- A future-ready, API-driven architecture that supports backend AI services and operational reporting

The system emphasizes **operational efficiency**, **accuracy**, and **auditability**, while maintaining a clean, responsive user interface suitable for day-to-day airline operations.

---

## Getting Started

### Installation Process

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd emd-processing-system
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run the development server**

   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

### Software Dependencies

- **Node.js** (LTS version recommended)
- **Next.js** (React framework)
- **React**
- **Tailwind CSS** for UI styling
- **Recharts** for operational and reporting visualizations
- **Font Awesome** (icons via CDN)
- **Local Storage / Browser APIs** for client-side persistence

---

### Latest Releases

The EMD Processing System is under active development.

Current capabilities:

- Operational dashboards (PNR Tables and PNR Details views)
- Queue-based filtering, pagination, and status indicators
- AI Agent Dock with typing animation and chat history persistence
- API-ready modular components

Formal versioning and release notes will be added with the first tagged production release.

---

### API References

The frontend is designed to integrate with REST-based backend APIs.

Planned API domains include:

- PNR / EMD list retrieval (pagination and filtering)
- Workflow actions (approve, reject, kill, reprocess)
- AI inference endpoints (explanations, recommendations)
- Operational and AI governance reporting

> The UI currently operates using mock/sample responses and can be connected to live APIs when available.

---

## Build and Test

### Build

```bash
npm run build
```

To run the production build locally:

```bash
npm run start
```

---

### Test

- Manual testing through dashboard workflows and AI Agent interactions
- Component design supports gradual introduction of unit and integration tests

---

## Project Principles

- **API-ready, not API-dependent**
- **Human-in-the-loop by design**
- **Operational transparency first**
- **Minimal dependencies and maintainable UI**
- **Built for extensibility (AI, reporting, governance)**

---

## License

This project is proprietary and intended for internal or controlled use.
