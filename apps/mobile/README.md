# OptiMind (Mobile App)

**OptiMind** is the cross-platform React Native mobile app for Kapany / Axiom Learn, built with Meta's **Astryx** design system architecture.

## Overview

- **Astryx UI System:** Built directly from the design token specifications and components of Meta's open-source Astryx design system (`https://astryx.atmeta.com`), including the centerpiece [ChatLayoutScrollButton](https://astryx.atmeta.com/components/ChatLayoutScrollButton).
- **Backend Integration:** Connects seamlessly to `@axiom/server` (Hono API running on port 8787).
- **Meta AI Models:** Supports interactive sessions powered by Meta's Muse models (Spark 1.3, Wonder, Contributor, and Voice Transcribe).

## Key Components

### 1. `ChatLayoutScrollButton` (`src/components/astryx/ChatLayoutScrollButton.tsx`)
Conforms to the exact Astryx component specification:
- **`isVisible: boolean`**: Tracks scroll position within `ChatMessageList` to only display when the user scrolls away from the bottom.
- **`label?: string`**: Smoothly expands into a wide pill (e.g. `"New messages"`) when new turns or tokens land while scrolled up.
- **`onClick: () => void`**: Springs or smoothly scrolls the chat list to the latest message and dismisses the unread indicator.
- **Design:** Floating dock elevation (`shadows.med`), rounded pill (`radius.full`), ChevronDown icon, and Astryx token colors.

### 2. Full Astryx Chat Layout
- `ChatLayout`: Root container managing header, message viewport, floating dock, and composer.
- `ChatMessageList`: FlatList with real-time scroll offset detection and unread message tracking.
- `ChatMessage` & `ChatMessageBubble`: Role-aligned message cards (User, AI Tutor, System).
- `ChatComposer`: Input bar with "Think Out Loud" toggle and dictation action.

### 3. Interactive Tutoring Features
- **QuestionCard**: Renders understanding probes with options, a 1–5 confidence rating, and the reasoning thinking field.
- **Knowledge Graph**: Explores claims and reasoning chains from previous lessons.
- **Daily Practice**: Spaced repetition flashcards with self-assessment grading.
- **Settings & Connectivity**: Dynamic host switcher (`localhost:8787` for iOS simulator, `10.0.2.2:8787` for Android emulator, or custom LAN IP for physical phones).

## Getting Started

### 1. Start the Backend Server (from root monorepo)
```bash
npm run dev:server
```
*(The server listens on `http://127.0.0.1:8787` by default).*

### 2. Start the OptiMind Mobile App
```bash
cd apps/mobile
npm run start
```
From Expo CLI:
- Press `i` to open in iOS Simulator
- Press `a` to open in Android Emulator
- Press `w` to open in Web Browser
- Scan the QR code with the Expo Go app on your physical iOS or Android device
