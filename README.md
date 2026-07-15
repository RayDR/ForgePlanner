# Project NorthStar Planner

Visual MVP for a long-range personal goal planner focused on life projects rather than work task management.

## Purpose

This prototype validates the core UX for a planner that helps one person organize a multi-month or multi-year goal such as:

- immigration planning
- savings goals
- career transitions
- AI / LLM study plans
- certifications
- portfolio building
- personal project execution

The initial scenario included here is **Project NorthStar**, a 24-month roadmap from August 2026 to July 2028 for preparing an Express Entry path to Canada while strengthening AI, cloud, and backend capabilities.

## MVP scope

- NorthStar Dashboard with plan metrics and yearly highlights
- Annual roadmap with 12 monthly cards per year
- Year switching for multi-year plans
- Monthly focus kanban grouped by status
- Drag and drop between months and status lanes
- Activity modal for editing title, dates, description, comments, subtasks, progress, and status
- Planner form that projects new activities into all covered months
- Local persistence with Zustand + localStorage
- Mock data only, no backend

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Zustand
- dnd-kit

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Notes

- This repo intentionally avoids authentication and backend work for now.
- The state shape is prepared so the prototype can later connect to a real API.
- Data is persisted in the browser using localStorage.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
