/**
 * Notification Settings Page for Team@Once
 *
 * Configure notification preferences: channels, categories, quiet hours
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  Mail,
  Smartphone,
  Monitor,
  Volume2,
  VolumeX,
  Moon,
  Clock,
  MessageSquare,
  Calendar,
  FileText,
  Users,
  Briefcase,
  DollarSign,
  AlertTriangle,
  Check,
  ArrowLeft,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { notificationService, NotificationPreferences } from '@/services/notificationService'

// Default notification categories for Team@Once
const NOTIFICATION_CATEGORIES = [
  {
    key: 'PROJECT',
    label: 'Projects',
    description: 'Project updates, status changes, and assignments',
    icon: Briefcase,
  },
  {
    key: 'MILESTONE',
    label: 'Milestones',
    description: 'Milestone approvals, deadlines, and deliverables',
    icon: FileText,
  },
  {
    key: 'PAYMENT',
    label: 'Payments',
    description: 'Payment confirmations, invoices, and escrow updates',
    icon: DollarSign,
  },
  {
    key: 'MESSAGE',
    label: 'Messages',
    description: 'Direct messages and chat notifications',
    icon: MessageSquare,
  },
  {
    key: 'DISPUTE',
    label: 'Disputes',
    description: 'Dispute notifications and resolutions',
    icon: AlertTriangle,
  },
  {
    key: 'REMINDER',
    label: 'Reminders',
    description: 'Task reminders and deadline alerts',
    icon: Calendar,
  },
  {
    key: 'SOCIAL',
    label: 'Team Updates',
    description: 'Team member changes and mentions',
    icon: Users,
  },
]

// Time options for quiet hours
const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0')
  return { value: `${hour}:00`, label: `${hour}:00` }
})

export default function NotificationSettings() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Local state for UI
  const [doNotDisturb, setDoNotDisturb] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [frequency, setFrequency] = useState<'immediate' | 'digest' | 'daily'>('immediate')
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false)
  const [quietHoursStart, setQuietHoursStart] = useState('22:00')
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00')

  // Load preferences on mount
  useEffect(() => {
    loadPreferences()
  }, [])

  const loadPreferences = async () => {
    try {
      setIsLoading(true)
      const prefs = await notificationService.getPreferences()
      setPreferences(prefs)

      // Set local state from preferences
      setDoNotDisturb(prefs.metadata?.doNotDisturb || false)
      setSoundEnabled(prefs.metadata?.soundEnabled !== false)
      setFrequency(prefs.metadata?.frequency || 'immediate')
      setQuietHoursEnabled(!!prefs.quiet_hours?.start)
      if (prefs.quiet_hours?.start) setQuietHoursStart(prefs.quiet_hours.start)
      if (prefs.quiet_hours?.end) setQuietHoursEnd(prefs.quiet_hours.end)
    } catch (error) {
      console.error('Error loading preferences:', error)
      toast.error('Failed to load notification preferences')
    } finally {
      setIsLoading(false)
    }
  }

  const savePreferences = async () => {
    if (!preferences) return

    try {
      setIsSaving(true)

      const updatedPreferences: Partial<NotificationPreferences> = {
        global: preferences.global,
        types: preferences.types,
        quiet_hours: quietHoursEnabled
          ? {
              start: quietHoursStart,
              end: quietHoursEnd,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : undefined,
        metadata: {
          ...preferences.metadata,
          doNotDisturb,
          soundEnabled,
          frequency,
        },
      }

      await notificationService.updatePreferences(updatedPreferences)
      toast.success('Notification preferences saved')
      setHasChanges(false)
    } catch (error) {
      console.error('Error saving preferences:', error)
      toast.error('Failed to save notification preferences')
    } finally {
      setIsSaving(false)
    }
  }

  const updateGlobal = (channel: 'push' | 'email' | 'in_app', enabled: boolean) => {
    if (!preferences) return

    setPreferences({
      ...preferences,
      global: {
        ...preferences.global,
        [channel]: enabled,
      },
    })
    setHasChanges(true)
  }

  const updateCategory = (
    category: string,
    channel: 'push' | 'email' | 'in_app',
    enabled: boolean
  ) => {
    if (!preferences) return

    const currentCategoryPrefs = preferences.types[category] || {
      push: true,
      email: false,
      in_app: true,
    }

    setPreferences({
      ...preferences,
      types: {
        ...preferences.types,
        [category]: {
          ...currentCategoryPrefs,
          [channel]: enabled,
        },
      },
    })
    setHasChanges(true)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Bell className="w-6 h-6" />
                  Notification Settings
                </h1>
                <p className="text-muted-foreground text-sm">
                  Manage how and when you receive notifications
                </p>
              </div>
            </div>

            <Button onClick={savePreferences} disabled={isSaving || !hasChanges}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              Configure global notification behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Do Not Disturb */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Moon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <Label className="text-base font-medium">Do Not Disturb</Label>
                  <p className="text-sm text-muted-foreground">
                    Pause all notifications except urgent ones
                  </p>
                </div>
              </div>
              <Switch
                checked={doNotDisturb}
                onCheckedChange={(checked) => {
                  setDoNotDisturb(checked)
                  setHasChanges(true)
                }}
              />
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5 text-blue-600" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <Label className="text-base font-medium">Notification Sound</Label>
                  <p className="text-sm text-muted-foreground">
                    Play a sound when you receive notifications
                  </p>
                </div>
              </div>
              <Switch
                checked={soundEnabled}
                onCheckedChange={(checked) => {
                  setSoundEnabled(checked)
                  setHasChanges(true)
                }}
              />
            </div>

            {/* Frequency */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <Label className="text-base font-medium">Notification Frequency</Label>
                  <p className="text-sm text-muted-foreground">
                    How often to receive notification digests
                  </p>
                </div>
              </div>
              <Select
                value={frequency}
                onValueChange={(value: 'immediate' | 'digest' | 'daily') => {
                  setFrequency(value)
                  setHasChanges(true)
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="digest">Hourly Digest</SelectItem>
                  <SelectItem value="daily">Daily Digest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Quiet Hours</CardTitle>
            <CardDescription>
              Set times when notifications will be silenced
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Moon className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <Label className="text-base font-medium">Enable Quiet Hours</Label>
                  <p className="text-sm text-muted-foreground">
                    Pause push notifications during specific hours
                  </p>
                </div>
              </div>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={(checked) => {
                  setQuietHoursEnabled(checked)
                  setHasChanges(true)
                }}
              />
            </div>

            {quietHoursEnabled && (
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex-1">
                  <Label className="text-sm text-muted-foreground mb-1.5 block">
                    Start Time
                  </Label>
                  <Select
                    value={quietHoursStart}
                    onValueChange={(value) => {
                      setQuietHoursStart(value)
                      setHasChanges(true)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-sm text-muted-foreground mb-1.5 block">
                    End Time
                  </Label>
                  <Select
                    value={quietHoursEnd}
                    onValueChange={(value) => {
                      setQuietHoursEnd(value)
                      setHasChanges(true)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Channels */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Channels</CardTitle>
            <CardDescription>
              Choose how you want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {/* Push Notifications */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <span className="font-medium">Push</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Browser and mobile push notifications
                </p>
                <Switch
                  checked={preferences?.global.push ?? true}
                  onCheckedChange={(checked) => updateGlobal('push', checked)}
                />
              </div>

              {/* Email Notifications */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <span className="font-medium">Email</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Email notifications to your inbox
                </p>
                <Switch
                  checked={preferences?.global.email ?? false}
                  onCheckedChange={(checked) => updateGlobal('email', checked)}
                />
              </div>

              {/* In-App Notifications */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  <span className="font-medium">In-App</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Notifications within the application
                </p>
                <Switch
                  checked={preferences?.global.in_app ?? true}
                  onCheckedChange={(checked) => updateGlobal('in_app', checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Categories</CardTitle>
            <CardDescription>
              Fine-tune notifications for each category
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr,80px,80px,80px] gap-4 py-2 border-b text-sm font-medium text-muted-foreground">
                <div>Category</div>
                <div className="text-center">Push</div>
                <div className="text-center">Email</div>
                <div className="text-center">In-App</div>
              </div>

              {/* Category rows */}
              {NOTIFICATION_CATEGORIES.map((category) => {
                const categoryPrefs = preferences?.types[category.key] || {
                  push: true,
                  email: false,
                  in_app: true,
                }

                return (
                  <div
                    key={category.key}
                    className="grid grid-cols-[1fr,80px,80px,80px] gap-4 py-3 items-center border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                        <category.icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{category.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={categoryPrefs.push}
                        onCheckedChange={(checked) =>
                          updateCategory(category.key, 'push', checked)
                        }
                        disabled={!preferences?.global.push}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={categoryPrefs.email}
                        onCheckedChange={(checked) =>
                          updateCategory(category.key, 'email', checked)
                        }
                        disabled={!preferences?.global.email}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Switch
                        checked={categoryPrefs.in_app}
                        onCheckedChange={(checked) =>
                          updateCategory(category.key, 'in_app', checked)
                        }
                        disabled={!preferences?.global.in_app}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
