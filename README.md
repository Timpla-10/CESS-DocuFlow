# CESS DocuFlow

**CESS DocuFlow** is a modern document tracking, workflow, and clearance management system designed for academic institutions and organizations.

---

## 🚀 Features

- **Document Tracking & Workflow:** Multi-stage routing, status checks, and requirement verification.
- **Role-Based Access Control:** Tailored experiences for students, advisers, secretaries, deans, and evaluators.
- **Activity & Notifications:** Real-time updates, timeline milestones, and notification dispatch.
- **Responsive UI:** Clean, accessible, modern interface built with React, TypeScript, Tailwind CSS, and Vite.

---

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS, Lucide Icons
- **State & Router:** React Router 7, Client State Store

---

## 📦 Getting Started

### Prerequisites
- Node.js 24 LTS
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/enelradcuteron/CESS-DocuFlow.git
   cd CESS-DocuFlow
   ```

2. Install dependencies:
   ```bash
   cd app
   npm ci
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

   Or from the root directory:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

### Verify the frontend build

From the repository root, run the same install and build commands used for Vercel and the GitHub frontend build check.

```bash
npm --prefix app ci --include=dev
npm run build
```

The build runs TypeScript before Vite. If GitHub shows a failed frontend check, open the **Type-check and build** job to see the file and line that stopped the build.

---

## 📁 Project Structure

```text
CESS Docuflow/
├── app/                     # React + Vite application
│   ├── src/
│   │   ├── components/      # UI components and shells
│   │   ├── pages/           # Application views and routes
│   │   ├── data/            # Mock store, seed data, and selectors
│   │   └── lib/             # Utilities and helpers
│   ├── public/              # Static assets
│   └── package.json
├── package.json             # Root workspace scripts
└── README.md
```
