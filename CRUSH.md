# Build & Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint 
- `npm run preview` - Preview production build

# Code Style Guidelines

## General
- Use Portuguese for comments and console messages (codebase convention)
- React functional components with hooks
- Minimal component structure - prefer single file components

## Imports & Dependencies
- React hooks: import use{HookName} from "react"
- Lucide icons: import { IconName } from "lucide-react"
- Markdown processing: react-markdown with remark/rehype plugins
- Canvas: Use standard browser Canvas API
- External libraries loaded via CDN (jsPDF, nerdamer)

## Naming Conventions
- Components: PascalCase (App, DevTests)
- Variables: camelCase (canvasRef, isDrawing)
- Constants: UPPER_SNAKE_CASE (WIDTH, HEIGHT)
- Functions: camelCase (startDraw, clearCanvas)

## Error Handling
- Try-catch blocks for async operations
- Graceful fallbacks for failed external script loads
- Error messages displayed in UI when operations fail
- Console warnings for non-critical failures

## Styling & UI
- Tailwind utility classes for styling
- Dark theme: bg-[#050814], text-slate-200
- Rounded elements: rounded-xl, rounded-lg
- Consistent spacing with p-4, px-3 py-2
- Grid layouts: grid-cols-1 md:grid-cols-2 gap-4
- Hover states: hover:bg-slate-700, hover:bg-indigo-500

## Canvas Drawing
- Touch and mouse event handling for cross-device support
- Position scaling for responsive canvas
- Separate pen/eraser modes with composite operations
- Dark background (#0b0f19) with light grid (#1b2336)

## State Management
- useState for component state
- useRef for DOM elements and persistent values
- localStorage for settings persistence
- Bool loading states for async operations