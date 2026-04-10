# Modal Components Documentation

## Overview

A comprehensive, production-ready modal system built with Radix UI Dialog and Framer Motion. These components replace browser alerts (`window.alert`, `window.confirm`) with beautiful, accessible, and animated modals that match the Team@Once design system.

## Features

- ✅ **Accessible**: Full ARIA support, keyboard navigation, focus management
- ✅ **Animated**: Smooth animations with Framer Motion
- ✅ **Responsive**: Works on all screen sizes (sm, md, lg, xl)
- ✅ **TypeScript**: Fully typed with comprehensive interfaces
- ✅ **Flexible**: Multiple usage patterns (hooks, standalone, components)
- ✅ **Design System**: Matches Login/Signup gradient buttons and backdrop blur
- ✅ **Production Ready**: Error handling, loading states, validation support

## Components

### 1. Modal (Base Component)
Generic modal for custom content.

### 2. ConfirmModal
Confirmation dialogs with Yes/No, Confirm/Cancel actions.

### 3. AlertModal
Alert messages with single OK button (Info, Success, Warning, Error).

### 4. FormModal
Modal wrapper for forms with submit/cancel buttons.

## Installation

All required dependencies are already installed:
- `@radix-ui/react-dialog` - Dialog primitives
- `framer-motion` - Animations
- `lucide-react` - Icons

## Usage Methods

### Method 1: Using Context (Recommended)

**Step 1**: Wrap your app with `ModalProvider`

```tsx
// In App.tsx or main.tsx
import { ModalProvider } from './components/ui/Modal';

function App() {
  return (
    <ModalProvider>
      <YourApp />
    </ModalProvider>
  );
}
```

**Step 2**: Use the `useModal` hook in any component

```tsx
import { useModal } from './components/ui/Modal';

function MyComponent() {
  const { confirm, alert } = useModal();

  const handleDelete = async () => {
    const confirmed = await confirm(
      'Are you sure you want to delete this item?',
      'Delete Item',
      { confirmVariant: 'danger' }
    );

    if (confirmed) {
      // Delete the item
      await deleteItem();
      await alert('Item deleted successfully!', 'Success', { type: 'success' });
    }
  };

  return <button onClick={handleDelete}>Delete</button>;
}
```

### Method 2: Standalone Functions (No Context Required)

```tsx
import { confirm, alert } from './components/ui/Modal';

async function handleAction() {
  // Show confirmation
  const result = await confirm('Are you sure?', 'Confirm Action');

  if (result) {
    // User clicked confirm
    await alert('Success!', 'Done', { type: 'success' });
  }
}
```

### Method 3: Component-Based (Full Control)

```tsx
import { ConfirmModal } from './components/ui/Modal';
import { useState } from 'react';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Delete</button>

      <ConfirmModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Delete Item"
        message="Are you sure?"
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          await deleteItem();
        }}
      />
    </>
  );
}
```

## API Reference

### Modal (Base Component)

```tsx
interface BaseModalProps {
  isOpen: boolean;                    // Controls modal visibility
  onClose: () => void;                // Called when modal closes
  size?: 'sm' | 'md' | 'lg' | 'xl';  // Modal width (default: 'md')
  title?: string;                     // Modal title
  description?: string;               // Modal description
  showCloseButton?: boolean;          // Show X button (default: true)
  closeOnOverlayClick?: boolean;      // Close on backdrop click (default: true)
  closeOnEscape?: boolean;            // Close on ESC key (default: true)
  children?: React.ReactNode;         // Modal content
}
```

**Example:**
```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Custom Modal"
  size="lg"
>
  <div>Your custom content here</div>
</Modal>
```

### ConfirmModal

```tsx
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;                                              // Default: "Confirm Action"
  message: string;                                             // Confirmation message
  confirmText?: string;                                        // Default: "Confirm"
  cancelText?: string;                                         // Default: "Cancel"
  confirmVariant?: 'primary' | 'danger' | 'warning' | 'success'; // Button style
  onConfirm: () => void | Promise<void>;                       // Confirm action
  onCancel?: () => void;                                       // Cancel action (optional)
  icon?: React.ReactNode;                                      // Custom icon (optional)
  // ...plus all BaseModalProps
}
```

**Example:**
```tsx
<ConfirmModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Delete Project"
  message="This will permanently delete the project. This action cannot be undone."
  confirmText="Delete Project"
  confirmVariant="danger"
  onConfirm={async () => {
    await deleteProject();
  }}
  icon={<Trash2 className="w-8 h-8 text-red-600" />}
/>
```

### AlertModal

```tsx
interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;                              // Auto-generated based on type
  message: string;                             // Alert message
  type?: 'info' | 'success' | 'warning' | 'error'; // Alert type (default: 'info')
  okText?: string;                             // Default: "OK"
  onOk?: () => void;                           // Called when OK clicked (optional)
  icon?: React.ReactNode;                      // Custom icon (optional)
  // ...plus all BaseModalProps
}
```

**Example:**
```tsx
<AlertModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  type="success"
  title="Success!"
  message="Your changes have been saved successfully."
/>
```

### FormModal

```tsx
interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;                   // Form fields
  onSubmit?: () => void | Promise<void>;       // Form submission handler
  submitText?: string;                         // Default: "Submit"
  cancelText?: string;                         // Default: "Cancel"
  showFooter?: boolean;                        // Show submit/cancel buttons (default: true)
  isLoading?: boolean;                         // External loading state (default: false)
  // ...plus all BaseModalProps
}
```

**Example:**
```tsx
<FormModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Create Project"
  submitText="Create"
  onSubmit={async () => {
    await createProject(formData);
  }}
>
  <div className="space-y-4">
    <input
      type="text"
      placeholder="Project name"
      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl"
    />
    <textarea
      placeholder="Description"
      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl"
    />
  </div>
</FormModal>
```

## Utility Functions

### confirm(message, title?, options?)

Returns a Promise that resolves to `true` if user confirms, `false` if cancelled.

```tsx
const result = await confirm(
  'Are you sure you want to proceed?',
  'Confirm Action',
  {
    confirmText: 'Yes, proceed',
    cancelText: 'No, cancel',
    confirmVariant: 'danger',
  }
);

if (result) {
  // User confirmed
} else {
  // User cancelled
}
```

### alert(message, title?, options?)

Returns a Promise that resolves when user clicks OK.

```tsx
await alert(
  'Your account has been created successfully!',
  'Welcome!',
  { type: 'success' }
);

// Code continues after user clicks OK
```

## Design System

### Modal Sizes

- **sm**: `max-w-md` (448px) - Confirmations, alerts
- **md**: `max-w-lg` (512px) - Forms, default
- **lg**: `max-w-2xl` (672px) - Complex forms
- **xl**: `max-w-4xl` (896px) - Full-featured content

### Button Variants

All buttons use the Team@Once gradient style:

- **primary**: Blue → Purple → Pink gradient (default)
- **danger**: Red gradient (for destructive actions)
- **warning**: Amber → Orange gradient
- **success**: Emerald → Green gradient

### Colors & Styling

- Backdrop: `bg-black/50 backdrop-blur-sm`
- Modal background: `bg-white/95 backdrop-blur-xl`
- Border: `border border-gray-200`
- Shadow: `shadow-2xl`
- Border radius: `rounded-2xl` (16px)

## Accessibility Features

✅ **Keyboard Navigation**
- ESC key closes modal (configurable)
- Tab cycles through interactive elements
- Enter/Space activates buttons

✅ **Focus Management**
- Focus trapped within modal when open
- Focus returns to trigger element on close

✅ **ARIA Attributes**
- Proper role attributes
- aria-labelledby for title
- aria-describedby for description
- Screen reader announcements

✅ **Visual Indicators**
- Clear focus outlines
- Color contrast meets WCAG 2.1 AA
- Icons supplement text (not replace)

## Advanced Examples

### Chained Modals

```tsx
const handleDelete = async () => {
  const confirmed = await confirm(
    'Delete this project?',
    'Confirm Deletion',
    { confirmVariant: 'danger' }
  );

  if (confirmed) {
    try {
      await deleteProject();
      await alert('Project deleted!', 'Success', { type: 'success' });
    } catch (error) {
      await alert('Failed to delete project', 'Error', { type: 'error' });
    }
  }
};
```

### Form with Validation

```tsx
const [errors, setErrors] = useState({});

const handleSubmit = async () => {
  const newErrors = validateForm(formData);

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    throw new Error('Validation failed'); // Prevents modal close
  }

  await saveData(formData);
};

<FormModal onSubmit={handleSubmit}>
  <input className={errors.email ? 'border-red-500' : ''} />
  {errors.email && <span className="text-red-600">{errors.email}</span>}
</FormModal>
```

### Custom Icons

```tsx
import { Trash2, Save, Download } from 'lucide-react';

<ConfirmModal
  icon={<Trash2 className="w-8 h-8 text-red-600" />}
  message="Delete permanently?"
/>

<AlertModal
  type="success"
  icon={<Save className="w-6 h-6 text-emerald-600" />}
  message="Saved successfully!"
/>
```

## Best Practices

1. **Use Context for Multiple Modals**: If you have many modals, use `ModalProvider` + `useModal` hook
2. **Standalone for One-offs**: Use standalone `confirm()`/`alert()` for quick confirmations
3. **Component-based for Complex UI**: Use `<FormModal>` when you need full control
4. **Always Handle Promises**: Modal actions are async - use await or .then()
5. **Provide Clear Messages**: Use action-oriented text ("Delete Project" not "Are you sure?")
6. **Match Variant to Action**: Use `danger` for destructive actions, `success` for positive ones
7. **Add Icons**: Icons improve comprehension and visual appeal
8. **Validate Forms**: Throw errors in `onSubmit` to prevent modal close on validation failure

## Common Patterns

### Delete Confirmation
```tsx
const result = await confirm(
  'This action cannot be undone.',
  'Delete Item?',
  { confirmVariant: 'danger' }
);
```

### Success Notification
```tsx
await alert('Saved successfully!', 'Success', { type: 'success' });
```

### Error Handling
```tsx
try {
  await riskyOperation();
} catch (error) {
  await alert(error.message, 'Error', { type: 'error' });
}
```

### Multi-step Process
```tsx
const step1 = await confirm('Ready for step 1?');
if (step1) {
  await doStep1();
  const step2 = await confirm('Continue to step 2?');
  if (step2) {
    await doStep2();
    await alert('All done!', 'Success', { type: 'success' });
  }
}
```

## Troubleshooting

**Modal doesn't appear**
- Check `isOpen` state is `true`
- Verify ModalProvider is wrapped around your app (for context usage)
- Check z-index conflicts (modals use z-50)

**Close button not working**
- Ensure `onClose` is properly bound to state setter
- Check `showCloseButton` is not `false`

**Standalone functions not working**
- Import from correct path: `import { confirm, alert } from './components/ui/Modal'`
- Check console for errors
- Ensure react-dom is installed

**Animations not smooth**
- Verify framer-motion is installed
- Check for CSS conflicts with `transition` properties

## Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Mobile browsers (iOS Safari, Chrome Android)

## Performance

- Modals are lazy-rendered (only when open)
- Animations are GPU-accelerated
- Context modals reuse a single container
- Standalone modals clean up after close

## License

Part of Team@Once frontend components. MIT License.

---

For more examples, see `ModalExamples.tsx` in the same directory.
