/* /src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

/* IPTV Streaming App Design System */
:root {
  /* Core App Colors - Dark Mode */
  --bg-primary: 0 0% 4%;
  --bg-secondary: 0 0% 10%;
  --bg-tertiary: 0 0% 12%;
  --text-primary: 0 0% 88%;
  --text-secondary: 0 0% 80%;
  --accent: 0 73% 60%;
  --accent-hover: 0 100% 50%;
  --accent-muted: 0 73% 60%;

  /* UI Elements */
  --border: 0 0% 20%;
  --input: 0 0% 15%;
  --ring: 0 73% 60%;
  --card: 0 0% 10%;
  --card-foreground: 0 0% 88%;

  /* Component Specific */
  --progress-color: 0 100% 50%;
  --buffered-color: 0 0% 40%;
  --live-indicator: 0 73% 60%;
  --channel-number-bg: 0 0% 0%;
  --channel-number-color: 0 0% 100%;

  /* Shadows and Effects */
  --shadow-sm: 0 2px 4px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  --shadow-glow: 0 0 20px hsl(var(--accent) / 0.3);

  /* Layout */
  --header-height: 60px;
  --bottom-nav-height: 70px;
  --sidebar-width: 280px;
  --border-radius: 12px;
  --border-radius-sm: 8px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 350ms ease;

  /* Design System Colors */
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --primary: var(--accent);
  --primary-foreground: 0 0% 100%;
  --secondary: var(--bg-secondary);
  --secondary-foreground: var(--text-primary);
  --muted: var(--bg-tertiary);
  --muted-foreground: var(--text-secondary);
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --radius: var(--border-radius);

  /* Additional shadcn/ui variables */
  --popover: var(--bg-secondary);
  --popover-foreground: var(--text-primary);
  --accent-color: var(--accent);
  --accent-foreground: 0 0% 100%;
}

/* Light Mode */
[data-theme="light"] {
  /* Core App Colors - Light Mode */
  --bg-primary: 0 0% 98%;
  --bg-secondary: 0 0% 94%;
  --bg-tertiary: 0 0% 90%;
  --text-primary: 0 0% 12%;
  --text-secondary: 0 0% 20%;
  --accent: 0 73% 60%;
  --accent-hover: 0 100% 50%;
  --accent-muted: 0 73% 60%;

  /* UI Elements */
  --border: 0 0% 80%;
  --input: 0 0% 94%;
  --ring: 0 73% 60%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 12%;

  /* Design System Colors */
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --primary: var(--accent);
  --primary-foreground: 0 0% 100%;
  --secondary: var(--bg-secondary);
  --secondary-foreground: var(--text-primary);
  --muted: var(--bg-tertiary);
  --muted-foreground: var(--text-secondary);
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  /* Additional shadcn/ui variables */
  --popover: var(--bg-secondary);
  --popover-foreground: var(--text-primary);
  --accent-color: var(--accent);
  --accent-foreground: 0 0% 100%;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Base Styles */
body {
  margin: 0;
  padding: 0;
  font-family: 'Inter', sans-serif;
  overflow: hidden; /* Prevent default scrolling on the body for app layout */
  background-color: #000; /* Ensure default background is black */
}

/* Loading Spinner */
.lds-ring {
  display: inline-block;
  position: relative;
  width: 80px;
  height: 80px;
}
.lds-ring div {
  box-sizing: border-box;
  display: block;
  position: absolute;
  width: 64px;
  height: 64px;
  margin: 8px;
  border: 8px solid #fff;
  border-radius: 50%;
  animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
  border-color: #3b82f6 transparent transparent transparent;
}
.lds-ring div:nth-child(1) {
  animation-delay: -0.45s;
}
.lds-ring div:nth-child(2) {
  animation-delay: -0.3s;
}
.lds-ring div:nth-child(3) {
  animation-delay: -0.15s;
}
@keyframes lds-ring {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Aspect Ratio */
.aspect-video {
  aspect-ratio: 16 / 9;
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-width);
  height: 100vh;
  background: hsl(var(--bg-secondary));
  transform: translateX(-100%);
  transition: transform var(--transition-normal);
  z-index: 100;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.sidebar-open {
  transform: translateX(0);
}

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 99;
  display: block; /* Visible when sidebar is open */
}

.sidebar-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: hsl(var(--text-primary));
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
}

.sidebar-content {
  padding: 2rem 1.5rem;
  padding-top: 4rem; /* Account for close button */
  color: hsl(var(--text-primary));
}

.sidebar-content h2 {
  margin-top: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.menu-section {
  margin-bottom: 1.5rem;
}

.menu-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  color: hsl(var(--text-secondary));
  margin-bottom: 0.5rem;
  padding-left: 0.5rem;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius-sm);
  color: hsl(var(--text-primary));
  text-decoration: none;
  transition: background-color var(--transition-fast);
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.menu-item:hover,
.menu-item.active {
  background-color: hsl(var(--accent) / 0.1);
  color: hsl(var(--accent));
}

.menu-item i {
  width: 1.25rem;
  height: 1.25rem;
}

/* Channel Grid */
.channels-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.channels-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.channels-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.channel-card {
  background: hsl(var(--card));
  border-radius: var(--border-radius);
  overflow: hidden;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  cursor: pointer;
  position: relative; /* For potential badges or overlays */
}

.channel-card:hover {
  transform: scale(1.03);
  box-shadow: var(--shadow-md);
}

.channel-card.landscape {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
}

.channel-card.landscape .channel-image {
  width: 80px;
  height: 45px;
  flex-shrink: 0;
}

.channel-card.landscape .channel-info {
  flex-grow: 1;
}

.channel-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block; /* Remove space below image */
}

.channel-info {
  padding: 0.75rem;
}

.channel-card.landscape .channel-info {
  padding: 0;
}

.channel-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: hsl(var(--text-primary));
  margin: 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-category {
  font-size: 0.75rem;
  color: hsl(var(--text-secondary));
  margin: 0;
}

.channel-number-badge {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  background-color: hsl(var(--channel-number-bg));
  color: hsl(var(--channel-number-color));
  border-radius: 50%;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
  z-index: 2;
}

.channel-status-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background-color: hsl(var(--live-indicator));
  color: white;
  border-radius: 1rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

/* Video Player */
.video-player-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  background-color: #000;
  overflow: hidden;
}

.video-player video {
  width: 100%;
  height: 100%;
  object-fit: contain; /* Or 'cover' depending on preference */
}

/* Controls */
.controls-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none; /* Allow clicks through when controls are hidden */
  transition: opacity var(--transition-fast);
  padding: 1rem;
}

.controls-overlay.visible {
  pointer-events: auto; /* Enable clicks when controls are visible */
}

.top-controls,
.bottom-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10; /* Ensure controls are above video */
}

.center-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: -2rem; /* Adjust based on play button size */
  z-index: 10;
}

.progress-container {
  width: 100%;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

/* Progress Bar */
.progress-bar {
  width: 100%;
  height: 4px;
  background-color: hsl(var(--muted));
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.progress-buffered,
.progress-played {
  position: absolute;
  height: 100%;
  top: 0;
  left: 0;
}

.progress-buffered {
  background-color: hsl(var(--buffered-color));
  z-index: 1;
}

.progress-played {
  background-color: hsl(var(--progress-color));
  z-index: 2;
  transition: width 0.1s ease; /* Smooth transition for playhead */
}

.progress-handle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background-color: hsl(var(--progress-color));
  border-radius: 50%;
  z-index: 3;
  cursor: grab;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.progress-container:hover .progress-handle {
  opacity: 1;
}

.progress-handle:active {
  cursor: grabbing;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: hsl(var(--text-secondary));
  margin-top: 0.25rem;
}

/* Settings Panel */
.settings-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  border-top-left-radius: var(--radius);
  border-top-right-radius: var(--radius);
  max-height: 70vh;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform var(--transition-normal);
  z-index: 20;
  padding: 1rem;
}

.settings-panel.open {
  transform: translateY(0);
}

.settings-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.settings-section {
  margin-bottom: 1.5rem;
}

.settings-section h3 {
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: hsl(var(--text-primary));
}

.settings-option {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: var(--border-radius-sm);
  margin-bottom: 0.25rem;
  cursor: pointer;
  text-align: left;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.settings-option:hover {
  background: hsl(var(--accent) / 0.1);
  color: hsl(var(--accent));
}

.settings-option.selected {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

/* Responsive Adjustments */
@media (min-width: 768px) {
  .channels-grid-4 {
    grid-template-columns: repeat(6, 1fr);
  }
  .channels-grid-3 {
    grid-template-columns: repeat(4, 1fr);
  }
  .channels-grid-2 {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .channels-grid-4 {
    grid-template-columns: repeat(8, 1fr);
  }
  .channels-grid-3 {
    grid-template-columns: repeat(6, 1fr);
  }
  .channels-grid-2 {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Landscape Mode Specific Styles (Added for VideoPlayer) */
.landscape-mode {
  /* Add any specific landscape container styles if needed */
}

.landscape-drawer {
  /* Override default drawer styles for landscape */
  height: auto !important; /* Allow height to be determined by content */
  max-height: 80vh; /* Set a max height relative to viewport */
  /* Optional: Adjust width if needed, maybe use a percentage */
  /* width: 80%; */
  /* left: 10%; */ /* Center horizontally if width is reduced */
  /* Remove bottom positioning if it's causing issues */
  /* bottom: auto; */
  /* top: 10vh; */ /* Position from top instead */
  border-radius: var(--radius);
  margin: 10vh auto; /* Center vertically with margin */
  max-width: 500px; /* Limit width on very wide screens */
}

.landscape-header {
  /* Adjust header styles for landscape */
  padding: 1rem !important; /* Ensure consistent padding */
  border-bottom: 1px solid hsl(var(--border));
}

.landscape-settings {
  /* Adjust settings content styles for landscape */
  max-height: calc(80vh - 60px); /* Account for header height */
  padding: 1rem !important; /* Ensure consistent padding */
  overflow-y: auto; /* Ensure scrollability if content overflows */
}

.landscape-accordion {
  /* Adjust accordion container styles */
  display: grid;
  grid-template-columns: 1fr 1fr; /* Example: 2 columns */
  gap: 1rem;
  width: 100%;
}

.landscape-accordion-item {
  /* Adjust individual accordion item styles */
  margin-bottom: 0;
  border: 1px solid hsl(var(--border));
  border-radius: var(--border-radius-sm);
  overflow: hidden;
}

.landscape-trigger {
  /* Adjust accordion trigger styles */
  padding: 0.75rem !important;
  font-size: 0.9rem !important;
  justify-content: flex-start !important; /* Align text left */
}

.landscape-options {
  /* Adjust options list styles */
  padding: 0.5rem !important;
  max-height: 150px !important; /* Limit height */
  overflow-y: auto !important; /* Make scrollable */
}

.landscape-options button {
  /* Adjust option button styles */
  padding: 0.5rem !important;
  font-size: 0.85rem !important;
  width: 100% !important;
  justify-content: flex-start !important; /* Align text left */
  margin-bottom: 0.1rem !important;
}

/* Error Page */
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #000;
  color: white;
  text-align: center;
  padding: 2rem;
}

.error-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: #ef4444; /* Red-500 */
}

.error-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.error-message {
  font-size: 1rem;
  color: #9ca3af; /* Gray-400 */
  margin-bottom: 1.5rem;
}

.error-actions {
  display: flex;
  gap: 1rem;
}

/* Loading Skeleton */
.skeleton {
  background: hsl(var(--muted));
  border-radius: var(--border-radius-sm);
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* Utility Classes */
.w-fit {
  width: fit-content;
}

.h-fit {
  height: fit-content;
}

/* Fix for shadcn/ui specific potential issues */
/* Ensure shadcn/ui components render correctly within the app's theme */
:where(.dark *) {
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --primary: var(--accent);
  --primary-foreground: 0 0% 100%;
  --secondary: var(--bg-secondary);
  --secondary-foreground: var(--text-primary);
  --muted: var(--bg-tertiary);
  --muted-foreground: var(--text-secondary);
  --card: var(--bg-secondary);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-secondary);
  --popover-foreground: var(--text-primary);
  --accent-color: var(--accent);
  --accent-foreground: 0 0% 100%;
  --border: var(--border);
  --input: var(--input);
  --ring: var(--ring);
  --radius: var(--border-radius);
}

/* Ensure text contrast in various contexts */
.text-primary-foreground {
  color: hsl(var(--primary-foreground));
}
.text-secondary-foreground {
  color: hsl(var(--secondary-foreground));
}
.text-muted-foreground {
  color: hsl(var(--muted-foreground));
}
.text-accent-foreground {
  color: hsl(var(--accent-foreground));
}
.text-destructive-foreground {
  color: hsl(var(--destructive-foreground));
}
