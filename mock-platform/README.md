# NexusCampus AI — Mock Platform

This directory provides the standalone mock data store and API engine for all **64 Product Modules (`M01` to `M64`)** of the NexusCampus AI platform.

## Architecture

- **Independent Location:** Lives outside `frontend/` as a dedicated mock data package.
- **Direct Frontend Integration:** Configured via Vite path alias (`@mock-platform`) so frontend modules can import data directly with zero network overhead and full TypeScript type inference.
- **Standalone Server Option:** `server.ts` can be executed to serve REST endpoints (`/api/v1/modules/:id`, `/api/v1/students`, etc.).

## Directory Layout

```
mock-platform/
├── core/
│   ├── types.ts          # Central relational enterprise types (Student, Staff, Course, Invoice, etc.)
│   ├── client.ts         # Query helpers and accessor functions
│   └── registry.ts       # Module dataset index for M01..M64
├── data/                 # Dedicated JSON datasets for each of the 64 modules
│   ├── m01_platform_core.json
│   ├── ...
│   └── m64_offline_edge.json
├── index.ts              # Main entrypoint barrel
└── server.ts             # Lightweight HTTP mock API server
```
