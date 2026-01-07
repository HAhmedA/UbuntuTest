[![Node.js CI](https://github.com/surveyjs/surveyjs-react-client/actions/workflows/build-node.js.yml/badge.svg)](https://github.com/surveyjs/surveyjs-react-client/actions/workflows/build-node.js.yml)

# AIEDAI - Survey & Mood Tracking Application

This is a comprehensive full-stack application built with **React** and **SurveyJS**. It allows users to create and manage surveys, while also featuring a specialized module for tracking and visualizing student mood and learning attributes over time.

## 🚀 Key Features

### 📊 Survey Management
Leveraging the full power of the [SurveyJS](https://surveyjs.io/) ecosystem:
- **Run Surveys**: Execute dynamic surveys using [SurveyJS Form Library](https://surveyjs.io/form-library/documentation/overview).
- **Edit Surveys**: Visual designer using [Survey Creator](https://surveyjs.io/survey-creator/documentation/overview).
- **View Results**: Analyze responses with [SurveyJS Dashboard](https://surveyjs.io/dashboard/documentation/overview).

### 📈 Mood History & Analytics
A committed feature for visualizing longitudinal data:
- **Interactive Charts**: Built with `recharts` to track various constructs over time (e.g., Efficiency, Anxiety, Motivation).
- **Time Periods**: View data for "Today", "Last 7 Days", or "All Time".
- **Detailed Metrics**: visualizations for specific learning constructs like *Self Assessment*, *Help Seeking*, and *Community*.

### 🔐 User Management
- **Authentication**: Secure Login and Registration flows.
- **State Management**: Powered by **Redux Toolkit** for robust session handling.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Redux Toolkit, React Router v6
- **Visualization**: Recharts, SurveyJS Analytics
- **Backend**: Node.js / Express
- **Database**: PostgreSQL

---

## 🐳 Dockerized Setup (Full Stack)

This is the recommended way to run the application with the Backend and Database.

### Prerequisites
- Docker Desktop 4.30+

### Quick Start
To build and start all services (Frontend, Backend, Postgres):

```bash
docker compose up --build -d
```

### Access Points
- **Web App**: http://localhost:3000
- **API**: http://localhost:8080/api
- **Postgres**: localhost:5433
  

### Useful Commands
```bash
# View logs
docker compose logs -f web       # Frontend logs
docker compose logs -f backend   # Backend API logs

# Stop and remove containers (persists data)
docker compose down

# Stop and reset database (DELETES DATA)
docker compose down -v
```

---

## 💻 Local Development (Frontend Only)

If you only want to work on the UI and don't need the backend API:

```bash
# Install dependencies
npm install

# Start development server
npm start
```
*Note: Features requiring API authentication or database persistence will not work in this mode.*
