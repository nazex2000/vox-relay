# 🎙️ Vox Relay

<div align="center">

![NestJS](https://img.shields.io/badge/NestJS-EA2845?style=for-the-badge&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)

**Enterprise-grade voice-to-email transcription system powered by AI**

[Features](#features) •
[Installation](#installation) •
[Configuration](#configuration) •
[Usage](#usage) •
[Architecture](#architecture) •
[Contributing](#contributing) •
[License](#license)

</div>

## ✨ Features

- 🎙️ **Advanced Voice Transcription**: High-accuracy voice-to-text conversion using OpenAI's Whisper API
- 📧 **Intelligent Email Extraction**: AI-powered extraction of email components from transcribed text
- 🤖 **Robust Telegram Integration**: Production-ready Telegram bot with comprehensive error handling
- 📤 **Enterprise Email Delivery**: Secure and reliable email sending with SMTP integration
- 🔒 **Enterprise Security**: Comprehensive input validation, error handling, and secure configuration
- 📝 **Production Logging**: Structured logging with multiple severity levels and detailed context

## 🚀 Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/vox-relay.git
cd vox-relay
```

2. Install dependencies:
```bash
npm install
```

3. Install FFmpeg (required for audio processing):
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows (using Chocolatey)
choco install ffmpeg
```

## ⚙️ Configuration

1. Create a `.env` file in the project root:
```env
# Application Settings
NODE_ENV=development
PORT=3000

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token

# OpenAI API Configuration
OPENAI_API_KEY=your_api_key

# SMTP Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_password
SMTP_SECURE=false

# Optional Settings
MAX_FILE_SIZE=25000000  # 25MB in bytes
REQUEST_TIMEOUT=30000   # 30 seconds in milliseconds
LOG_LEVEL=debug        # debug, info, warn, error
```

2. Configure required environment variables:
   - Obtain a bot token from [@BotFather](https://t.me/botfather)
   - Create an API key from [OpenAI Dashboard](https://platform.openai.com)
   - Configure SMTP credentials for email delivery

## 🎯 Usage

1. Start the server:
```bash
npm run start:dev
```

2. Send a voice message to your Telegram bot
3. The bot will:
   - Transcribe the voice message using OpenAI Whisper
   - Extract email components using GPT-4
   - Present the extracted information for confirmation
   - Send the email upon confirmation

## 🏗️ Architecture

The project is built using NestJS and follows a modular, microservice-oriented architecture:

### Core Modules

- **TelegramModule**: Handles Telegram bot integration and message processing
  - Manages bot lifecycle and graceful shutdown
  - Implements robust error handling and retry mechanisms
  - Provides user-friendly interaction flows

- **WhisperModule**: Manages voice message processing
  - Handles audio file validation and conversion
  - Integrates with OpenAI's Whisper API
  - Implements efficient file management

- **GptModule**: Processes transcribed text
  - Extracts email components using GPT-4
  - Implements intelligent text analysis
  - Provides structured email data

- **EmailModule**: Manages email operations
  - Handles SMTP configuration and validation
  - Implements secure email delivery
  - Provides email template management

### Data Flow

1. Voice Message Reception → TelegramService
   - Validates incoming message
   - Downloads voice file
   - Initiates processing pipeline

2. Voice Processing → WhisperService
   - Converts audio to MP3
   - Transcribes using Whisper API
   - Returns structured text

3. Text Analysis → GptService
   - Analyzes transcribed text
   - Extracts email components
   - Validates extracted data

4. Email Delivery → EmailService
   - Formats email content
   - Validates SMTP configuration
   - Sends email with retry mechanism

## 🤝 Contributing

We welcome contributions from the community. Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Implement your changes with proper testing
4. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
5. Push to the branch (`git push origin feature/AmazingFeature`)
6. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Maintain comprehensive test coverage
- Update documentation for new features
- Follow the existing code style
- Add appropriate logging and error handling

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Enterprise Node.js framework
- [OpenAI](https://openai.com/) - State-of-the-art AI APIs
- [Telegraf](https://telegraf.js.org/) - Robust Telegram Bot framework
- [FFmpeg](https://ffmpeg.org/) - Industry-standard audio processing

---

<div align="center">
Built with ❤️ by Nazário Zandamela
</div>
