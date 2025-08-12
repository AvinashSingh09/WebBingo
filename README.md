# WebBingo - Multiplayer Bingo Game 🎱

A real-time multiplayer Bingo game built with Node.js, Express, and Socket.IO. Features room-based gameplay with host controls, auto-marking, and beautiful animations.

## ✨ Features

- **🎮 Real-time Multiplayer**: Join rooms with 5-character codes
- **🎯 Host Controls**: Start/pause/reset games, adjust call intervals
- **🎲 Fair Play**: Server-generated cards with seeded randomization
- **🏆 Win Detection**: Server-side validation for lines and full house
- **📱 Responsive Design**: Works on desktop and mobile devices
- **🎉 Celebrations**: Confetti animations for winners
- **⚡ Auto-marking**: Optional automatic number marking
- **🔄 Host Persistence**: Reconnect and reclaim host control

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/AvinashSingh09/WebBingo.git
cd WebBingo
```

2. Install server dependencies:
```bash
cd server
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and go to `http://localhost:3000`

## 🎯 How to Play

1. **Create a Room**: Enter your name and click "Create Room" to become the host
2. **Join a Room**: Enter the 5-character room code to join an existing game
3. **Start Game**: Host can start the game from the lobby
4. **Mark Numbers**: Click numbers on your card as they're called
5. **Win**: Get a line (row, column, or diagonal) or full house to win!

## 🏗️ Project Structure

```
WebBingo/
├── server/
│   ├── client/           # Frontend files served by Express
│   │   ├── index.html    # Home page
│   │   ├── lobby.html    # Lobby/waiting room
│   │   ├── play.html     # Game page
│   │   ├── home.js       # Home page logic
│   │   ├── lobby.js      # Lobby controls
│   │   ├── main.js       # Game logic
│   │   └── style.css     # Styling
│   ├── package.json      # Server dependencies
│   └── server.js         # Main server file
├── client/               # Alternative client files
├── README.md
└── .gitignore
```

## 🛠️ Technologies Used

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Real-time Communication**: WebSockets via Socket.IO
- **Styling**: Modern CSS with gradients and animations

## 🚢 Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN cd server && npm ci --omit=dev
EXPOSE 3000
CMD ["node", "server/server.js"]
```

### Cloud Platforms
- **Railway**: Connect your GitHub repo and deploy automatically
- **Render**: Create a new web service from your repository
- **Fly.io**: Use `flyctl deploy` with the included Dockerfile
- **Heroku**: Deploy using Git with the included package.json

## 🎮 Game Rules

- **Lines**: Complete any row, column, or diagonal to win
- **Full House**: Mark all numbers on your card
- **Free Space**: Center square (★) is automatically marked
- **Auto-mark**: Host can enable automatic marking of called numbers
- **Host Controls**: Only the host can start, pause, and reset games

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### Game Settings
- `MAX_PLAYERS_PER_ROOM`: Maximum players per room (default: 200)
- Call intervals: 0.8s to 4.0s (configurable by host)
- Auto-marking: Toggle on/off

## 📝 Development

### Adding New Features
- **Prizes**: Add new win conditions in `server.js` near `checkLinesAndFull()`
- **Themes**: Modify CSS variables in `style.css`
- **Sounds**: Add audio elements to the client pages

### Socket Events
- `create_room` / `join_room`: Room management
- `host_start` / `host_pause` / `host_reset`: Game control
- `number_called` / `room_state`: Real-time updates
- `mark_cell` / `unmark_cell`: Player actions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Author

**Avinash Singh**
- GitHub: [@AvinashSingh09](https://github.com/AvinashSingh09)

## 🙏 Acknowledgments

- Built with ❤️ using modern web technologies
- Inspired by classic Bingo gameplay
- Thanks to the Socket.IO team for real-time capabilities
