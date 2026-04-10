# Project Collaboration Pages - Quick Start

## 🚀 Quick Integration

### 1. Import Pages in Your Router

```tsx
// Example with React Router v6
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Workspace, Chat, VideoCall, Files } from './pages/project';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/project/:projectId">
          <Route path="workspace" element={<Workspace />} />
          <Route path="chat" element={<Chat />} />
          <Route path="call/:callId" element={<VideoCall />} />
          <Route path="files" element={<Files />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

### 2. Navigation Example

```tsx
import { useNavigate, useParams } from 'react-router-dom';

const ProjectNavigation = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();

  return (
    <nav className="flex space-x-4 p-4">
      <button
        onClick={() => navigate(`/project/${projectId}/workspace`)}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg"
      >
        Workspace
      </button>
      <button
        onClick={() => navigate(`/project/${projectId}/chat`)}
        className="px-4 py-2 bg-purple-500 text-white rounded-lg"
      >
        Chat
      </button>
      <button
        onClick={() => navigate(`/project/${projectId}/call/room-${projectId}`)}
        className="px-4 py-2 bg-green-500 text-white rounded-lg"
      >
        Video Call
      </button>
      <button
        onClick={() => navigate(`/project/${projectId}/files`)}
        className="px-4 py-2 bg-orange-500 text-white rounded-lg"
      >
        Files
      </button>
    </nav>
  );
};
```

### 3. Using Components Standalone

```tsx
import { TaskCard, MessageBubble, FileItem, UserAvatar } from '@/components/project';
import type { Task, Message, FileItem as FileType, TeamMember } from '@/lib/types/project';

// Example: Using TaskCard
const MyComponent = () => {
  const task: Task = {
    id: '1',
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication',
    status: 'in-progress',
    priority: 'high',
    assignee: {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'developer',
      status: 'online',
    },
    dueDate: new Date(2025, 10, 25),
    tags: ['backend', 'security'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <TaskCard
      task={task}
      onClick={() => console.log('Task clicked:', task.id)}
    />
  );
};
```

## 📦 File Structure

```
src/
├── lib/types/project.ts          # All TypeScript types
├── components/project/            # Reusable components
│   ├── TaskCard.tsx
│   ├── MessageBubble.tsx
│   ├── FileItem.tsx
│   ├── UserAvatar.tsx
│   └── index.ts
└── pages/project/                 # Full page components
    ├── Workspace.tsx              # Kanban board
    ├── Chat.tsx                   # Team chat
    ├── VideoCall.tsx              # Video conferencing
    ├── Files.tsx                  # File manager
    └── index.ts
```

## 🎨 Styling

All pages use Tailwind CSS with the Team@Once design system:
- Gradients: `from-blue-50 via-purple-50 to-pink-50`
- Primary colors: Blue (#47bdff) and Purple
- Rounded corners: `rounded-xl` and `rounded-2xl`
- Shadows: `shadow-sm`, `shadow-lg`, `shadow-2xl`

## 🔗 Dependencies Required

```bash
npm install @hello-pangea/dnd framer-motion lucide-react date-fns
```

## 📖 Full Documentation

See `/PROJECT_COLLABORATION_PAGES.md` for complete documentation including:
- Detailed feature descriptions
- API integration guides
- WebSocket setup
- Testing examples
- Best practices
- Troubleshooting

## 🎯 Next Steps

1. Connect to your backend API
2. Implement WebSocket for real-time features
3. Add authentication/authorization
4. Customize mock data with real data
5. Add error handling and loading states
6. Implement file upload backend
7. Set up video call infrastructure (WebRTC)

## 💡 Tips

- All pages are fully responsive
- Components use TypeScript for type safety
- Animations are built with Framer Motion
- Icons from Lucide React
- Date formatting with date-fns
- Drag-and-drop with @hello-pangea/dnd

## 🐛 Common Issues

**TypeScript errors:** Make sure all types from `@/lib/types/project` are imported correctly.

**Import errors:** Check that path aliases are configured in your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**Styling not working:** Ensure Tailwind CSS is properly configured and all custom colors are defined in `tailwind.config.ts`.
