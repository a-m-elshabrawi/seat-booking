# Seat Booking System

A web-based seat booking interface built with Google Apps Script and HTML/CSS/JavaScript. This system provides a visual seat selection interface with gender-based sectioning and real-time booking management.

## ⚠️ Important Notice

**This repository contains ONLY the frontend interface** - it is not a complete, working application. To make this seat booking system functional, you need to:

1. **Create a separate Google Apps Script project** with the backend code
2. **Set up a Google Sheet** for data storage
3. **Deploy the Apps Script as a web app** with proper permissions
4. **Configure the frontend** to connect to your deployed backend

This frontend was designed for a specific event and is now preserved as a code example. **The backend Google Apps Script and Google Sheet are NOT included in this repository.**

## Features

### Core Functionality
- **Visual Seat Map**: Interactive seat layout with real-time availability
- **Gender-Based Sections**: Separate seating areas for male and female users
- **Bilingual Support**: Arabic and English language support
- **Real-time Updates**: Live seat status updates via polling
- **Booking Management**: Reserve and cancel seat bookings
- **Responsive Design**: Works on desktop and mobile devices

### Technical Features
- **Google Apps Script Backend**: Server-side logic for booking management
- **Google Sheets Integration**: Data storage using Google Spreadsheets
- **Concurrency Control**: Lock service to prevent double bookings
- **Caching System**: Optimized seat lookup with caching

## Project Structure

```
seat-booking/
├── Code.gs          # Google Apps Script backend code (for reference only)
├── index.html       # Frontend HTML/CSS/JavaScript (main interface)
└── README.md        # This file
```

**Note**: The `Code.gs` file is included for reference only. You must create your own Google Apps Script project and copy this code there to have a working backend.

## Architecture

### Backend (Code.gs)
- **Booking API**: Functions for reserving, canceling, and checking seat status
- **Data Management**: Google Sheets integration for persistent storage
- **Configuration**: Centralized config for booking status and spreadsheet settings
- **Security**: Admin password verification and concurrency locks

### Frontend (index.html)
- **Seat Layout**: Dynamic seat positioning with SVG icons
- **User Interface**: Modal dialogs for booking and cancellation
- **Internationalization**: Complete Arabic/English translation system
- **State Management**: Real-time seat status and user selections

## Seat Layout

The system supports a complex seating arrangement:

### Column Layout
- **Left Columns**: L1 (8 seats), L2 (6 seats), L3 (6 seats), L4 (5 seats)
- **Right Columns**: R1 (8 seats), R2 (6 seats), R3 (6 seats), R4 (5 seats)

### Row Layout
- **Center Rows**: A (3 seats), B (6 seats), C (8 seats), D (8 seats)

### Gender Restrictions
- **Male Users**: Can only book seats in R1-R4 columns
- **Female Users**: Can book seats in L1-L4 columns and A-D rows

## API Endpoints

The Google Apps Script provides these functions:

### Public API
- `getBookingStatus()` - Check if booking is open/closed
- `getSeats()` - Retrieve all seat statuses
- `reserveSeat(seatId, name, college, phone)` - Book a seat
- `cancelBooking(type, value)` - Cancel existing booking

### Management API
- `seedSeats()` - Rebuild seat inventory (destroys existing data)
- `syncInventoryWithCode()` - Add missing seats to inventory

### Setup Functions
- `createInventorySpreadsheet()` - Create new Google Sheet for data
- `setSpreadsheetId(id)` - Connect to existing spreadsheet

## Configuration

### Backend Configuration (Code.gs)
```javascript
const CONFIG = {
  sheetName: 'Inventory',
  propKey: 'SEAT_INVENTORY_ID',
  bookingOpen: true,  // Toggle booking on/off
  // Optional: hardcode spreadsheet ID
  // spreadsheetId: 'YOUR_SHEET_ID_HERE'
};
```

### Booking Control
- **Backend Control**: Booking status controlled via `CONFIG.bookingOpen` in Code.gs
- **Global Setting**: Changes affect all users system-wide

## Data Structure

### Google Sheet Format
| Column | Description |
|--------|-------------|
| SeatID | Unique seat identifier (e.g., "L1-3", "R2-5", "B4") |
| Status | Booking status ("AVAILABLE", "BOOKED") |
| HolderName | Full name of person who booked |
| College | College/University name |
| Phone | Phone number |
| Timestamp | When booking was made/cancelled |

## Setup Instructions

### Prerequisites
- Google account with access to Google Apps Script and Google Sheets
- Basic understanding of Google Apps Script deployment

### Step 1: Create Google Apps Script Backend
1. Go to [Google Apps Script](https://script.google.com)
2. Create a new project
3. Copy the entire content of `Code.gs` into the script editor
4. Save the project with a descriptive name (e.g., "Seat Booking Backend")

### Step 2: Set Up Data Storage
1. In your Apps Script project, run the `createInventorySpreadsheet()` function
2. This will create a Google Sheet and store its ID in Script Properties
3. Note the spreadsheet URL for reference

### Step 3: Deploy the Backend
1. In Apps Script, go to "Deploy" → "New deployment"
2. Choose "Web app" as the type
3. Set execution permissions to "Anyone" (or "Anyone with Google account" for more security)
4. Set access to "Anyone" (or restrict as needed)
5. Deploy and copy the web app URL

### Step 4: Configure Frontend
1. Open `index.html` in a text editor
2. The frontend is already configured to work with Google Apps Script
3. Deploy the HTML file to your preferred hosting service (Netlify, GitHub Pages, etc.)

### Step 5: Connect Frontend to Backend
- The frontend uses `google.script.run` to communicate with the Apps Script backend
- Ensure your HTML is served from the same domain as your Apps Script web app, or configure CORS if needed

### Important Notes
- **This repository does NOT include a working backend** - you must create it separately
- **The Google Sheet is created automatically** when you run the setup function
- **Booking control** is managed via the `CONFIG.bookingOpen` setting in the Apps Script

## Browser Compatibility

- **Modern Browsers**: Chrome, Firefox, Safari, Edge
- **Mobile Support**: iOS Safari, Chrome Mobile
- **Features Used**: ES6+, CSS Grid, SVG, Local Storage

## Security Considerations

- **Data Validation**: Input sanitization on both client and server
- **Concurrency**: Lock service prevents race conditions
- **Access Control**: Gender-based seat restrictions
- **Rate Limiting**: Consider implementing for production use

## Limitations

- **Google Apps Script Quotas**: Subject to Google's execution limits
- **No Database**: Uses Google Sheets as data storage
- **Single Instance**: Not designed for high-concurrency scenarios
- **Browser Storage**: Language preference stored in localStorage

## Customization

### Styling
- Modify CSS variables in `:root` for theming
- Update seat colors and hover effects
- Customize modal and button styles

### Layout
- Adjust seat positions in the geometry section
- Modify seat counts in `COUNTS` object
- Update gender restrictions in `isSeatAllowedForGender()`

### Localization
- Add new languages to the `T` translation object
- Update RTL/LTR direction settings
- Modify date/time formats as needed

## Contributing

This is a demonstration project. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is provided as-is for educational and demonstration purposes. Please ensure you have appropriate permissions before using in production environments.

## Support

Since this is no longer an active project, support is limited. The code is provided as a reference implementation for similar seat booking systems.

## What's NOT Included

- ❌ **Working Google Apps Script backend** - You must create this separately
- ❌ **Google Sheet with data** - You must set this up yourself
- ❌ **Deployed web application** - You must deploy both frontend and backend
- ❌ **Database or server** - Uses Google Sheets as data storage
- ❌ **Authentication system** - No user accounts or login required

## What IS Included

- ✅ **Complete frontend interface** - Ready-to-use HTML/CSS/JavaScript
- ✅ **Backend code reference** - Copy `Code.gs` to your Apps Script project
- ✅ **Documentation** - This comprehensive README
- ✅ **Bilingual support** - Arabic and English interface
- ✅ **Responsive design** - Works on desktop and mobile

---

**Note**: This system was originally designed for a specific event and has been sanitized for public release. All sensitive information has been removed or replaced with generic placeholders.
