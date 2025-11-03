# 🎴 Konchina - Online Multiplayer Card Game

A real-time online card game built with Next.js, Firebase, and Framer Motion.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up Firebase:
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firestore Database (start in test mode for development)
   - Enable Anonymous Authentication (optional)
   - Copy your Firebase config

3. Set up card assets:
   - Your card images should be in `public/assets/cards/` directory
   - The existing cards from the old project should already be there
   - Card naming format: `{value}_of_{suit}.png` (e.g., `ace_of_spades.png`, `jack_of_hearts.png`)
   - If images are missing, the game will show a text-based fallback

4. Create `.env.local` file in the root directory:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔧 Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use an existing one
3. Enable **Firestore Database**:
   - Go to Firestore Database
   - Click "Create database"
   - Start in **test mode** (for development)
   - Choose a location
4. (Optional) Enable **Anonymous Authentication**:
   - Go to Authentication
   - Click "Get started"
   - Enable "Anonymous" sign-in method
5. Copy your Firebase config from Project Settings > Your apps
6. Paste the values into your `.env.local` file

**Note**: If you don't set up Firebase, the game will still work locally but won't have multiplayer functionality.

## 🎮 Game Rules

### Setup
- Standard 52-card deck
- Each player gets 4 cards
- 4 cards are placed face-up on the table
- Rest of deck is the draw pile

### Gameplay
1. Players alternate turns
2. On your turn, play one card from your hand
3. You can capture cards if:
   - **Single Match**: Your card matches a card's value on the table
   - **Summation**: Your card's value equals the sum of multiple table cards
   - **Jack Rule**: A Jack captures ALL cards on the table
4. If no capture is possible, your card stays on the table
5. When both players run out of cards, draw 4 new cards
6. Game continues until deck is empty

### Scoring
- Each captured card = 1 point
- Capturing the last table card = +1 bonus point
- Player with most points wins

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (React + TypeScript)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **State Management**: Zustand
- **Database**: Firebase Firestore (Realtime)
- **Auth**: Firebase Anonymous Auth
- **Hosting**: Vercel (recommended)

## 📁 Project Structure

```
/src
 ├─ app/              # Next.js app router pages
 │   ├─ page.tsx      # Home/Lobby page
 │   └─ room/[id]/    # Game room page
 ├─ components/       # React components
 │   ├─ Card.tsx      # Card component
 │   ├─ Hand.tsx      # Player hand
 │   ├─ Table.tsx     # Game table
 │   └─ GameBoard.tsx # Main game board
 ├─ hooks/            # Custom React hooks
 │   ├─ useFirebaseSync.ts
 │   └─ useGameLogic.ts
 ├─ lib/              # Utilities and configs
 │   ├─ firebase.ts   # Firebase initialization
 │   └─ gameLogic.ts  # Game logic helpers
 └─ store/            # Zustand stores
     └─ gameStore.ts  # Game state management
```

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy!

The site will be live at `your-project.vercel.app`

## 📝 License

MIT

