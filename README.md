# Echo - Real-Time Chatting App

**Echo** is a real-time chatting application built with a modern tech stack. It provides instant messaging capabilities and a user-friendly interface. This documentation will guide you through setting up and running the project.

## Tech Stack

- **Backend**:
  - Node.js
  - TypeScript
  - Express
  - Socket.io
  - Drizzle
  - PostgreSQL
  - Firebase (for Google Sign-In)

- **Frontend**:
  - Vite
  - Tailwind CSS

## Features

- Real-time messaging
- Online status indicator
- User typing indicator
- API routes for authentication, user management, and messaging
- Google Sign-In integration with Firebase

## Installation

### Backend Setup

1. **Clone the Repository**

   ```bash
   git clone https://github.com/MaheshMoholkar/echo.git
   cd echo
   ```

2. **Navigate to the Backend Directory**

   ```bash
   cd backend
   ```

3. **Install Dependencies**

   ```bash
   npm install
   ```

4. **Create a `.env` File**

   Create a `.env` file in the backend directory and add the following variables:

   ```env
   PORT=4000
   DATABASE_URL=your_postgres_database_url
   ```

5. **Run the Backend**

   ```bash
   npm run dev
   ```

### Frontend Setup

1. **Navigate to the Frontend Directory**

   ```bash
   cd ../frontend
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Add Firebase Configuration**

   Create a `.env` file in the frontend directory and add your Firebase configuration:

   ```env
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_firebase_app_id
   ```

4. **Run the Frontend**

   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:5173`.

## API Endpoints

### Authentication Routes

- `POST /api/auth/check-user`: Check if a user exists.
- `POST /api/auth/login-user`: Authenticate a user.
- `POST /api/auth/register-user`: Register a new user.

### Message Routes

- `POST /api/message/add-message`: Add a new message.
- `GET /api/message/get-messages`: Retrieve messages.

### User Routes

- `GET /api/user/get-users`: Retrieve a list of users.

## Socket.io Events

- `add-user`: Notify the server that a user has connected.
- `send-msg`: Send a message to another user.
- `typing`: Notify other users that the sender is typing.
- `check-online`: Check if a user is online.
