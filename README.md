# ProxiSpeak – Real-Time Virtual Office Platform

**ProxiSpeak** is a real-time virtual office platform designed to simulate an interactive remote working environment. It enables employees to communicate, collaborate, attend meetings, and interact with colleagues through a shared virtual workspace.

The platform combines real-time communication, proximity-based voice interaction, employee tracking, and collaborative meeting features into one application.

## Key Features

- **Virtual Office:** Interactive 2D office environment with employee avatars.
- **Proximity-Based Voice Chat:** Voice communication based on the distance between employees.
- **Multiple Rooms:** Separate workspace, conference room, and meeting rooms.
- **Real-Time Employee Tracking:** Live employee positions and proximity updates.
- **Team Meetings:** Create and join collaborative meetings.
- **Screen Sharing:** Share screens during meetings.
- **Instant Messaging:** Real-time employee communication.
- **Authentication:** Employee login and profile management.
- **Database Integration:** MongoDB-backed employee information and application data.

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, Vite |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Real-Time Communication | Socket.IO |
| Voice Communication | WebRTC |
| Authentication | JWT, bcryptjs |
| Development Tools | VS Code, Git, GitHub |

## Project Architecture

```text
ProxiSpeak/
│
├── client/
│   └── React + Vite frontend
│
├── server/
│   ├── routes/
│   ├── models/
│   ├── scripts/
│   └── server.js
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm
- MongoDB Atlas account or MongoDB instance
- Git

### 1. Clone the repository

```bash
git clone https://github.com/RajdipJana/ProxiSpeak.git
cd ProxiSpeak
```

### 2. Install frontend dependencies

```bash
cd client
npm install
```

### 3. Install backend dependencies

Open another terminal:

```bash
cd server
npm install
```

### 4. Configure environment variables

Create a `.env` file inside the `server` directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
```

Never commit real credentials or environment files to GitHub.

### 5. Start the backend

From the `server` directory:

```bash
node server.js
```

### 6. Start the frontend

From the `client` directory:

```bash
npm run dev
```

Open the local Vite URL displayed in your terminal.

## Project Status

Core application features have been implemented, including virtual office interaction, real-time communication, employee tracking, meetings, and screen sharing.

Deployment and production configuration are the next steps.

## Author

**Rajdip Jana**

B.Tech – Computer Science and Engineering (AI & ML)

GitHub: [RajdipJana](https://github.com/RajdipJana)

Project Repository: [ProxiSpeak](https://github.com/RajdipJana/ProxiSpeak)