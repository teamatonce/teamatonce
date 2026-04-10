/**
 * WorkspaceSelector Component
 * Beautiful dropdown for selecting and switching between workspaces
 * Based on Team@Once's SimpleMegaMenu company selector
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Building2,
  Plus,
  Check,
  Settings,
  Users,
  BarChart3,
  Crown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { Workspace } from '@/types/workspace';

interface WorkspaceSelectorProps {
  /** Callback when workspace is selected */
  onWorkspaceChange?: (workspace: Workspace) => void;

  /** Show create workspace option */
  showCreateOption?: boolean;

  /** Custom class names */
  className?: string;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  onWorkspaceChange,
  showCreateOption = true,
  className = '',
}) => {
  const navigate = useNavigate();

  // Zustand store
  const {
    currentWorkspace,
    workspaces,
    setCurrentWorkspace,
    fetchUserWorkspaces,
    isLoading,
  } = useWorkspaceStore();

  // Dropdown state
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch workspaces on mount
  useEffect(() => {
    fetchUserWorkspaces();
  }, [fetchUserWorkspaces]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle workspace selection
  const handleWorkspaceSelect = (workspace: Workspace) => {
    // Update store
    setCurrentWorkspace(workspace);

    // Store in localStorage for persistence
    localStorage.setItem('selectedWorkspaceId', workspace.id);

    // Call optional callback
    onWorkspaceChange?.(workspace);

    // Close dropdown
    setIsOpen(false);

    // Navigate to workspace dashboard
    navigate(`/workspace/${workspace.id}/dashboard`);
  };

  // Handle create workspace
  const handleCreateWorkspace = () => {
    setIsOpen(false);
    navigate('/workspace/create');
  };

  // Handle workspace settings
  const handleWorkspaceSettings = (workspaceId: string) => {
    setIsOpen(false);
    navigate(`/workspace/${workspaceId}/settings`);
  };

  // Get workspace color or default
  const getWorkspaceColor = (workspace: Workspace) => {
    return workspace.color || '#3B82F6'; // Default blue
  };

  // Get workspace initials
  const getWorkspaceInitials = (workspace: Workspace) => {
    return workspace.name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => {
          const isOpening = !isOpen;
          setIsOpen(isOpening);

          // Refetch workspaces when opening dropdown
          if (isOpening) {
            fetchUserWorkspaces();
          }
        }}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 border border-gray-200 dark:border-gray-700"
      >
        {currentWorkspace ? (
          <>
            {/* Workspace Icon */}
            {currentWorkspace.logo ? (
              <img
                src={currentWorkspace.logo}
                alt={currentWorkspace.name}
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: getWorkspaceColor(currentWorkspace) }}
              >
                {getWorkspaceInitials(currentWorkspace)}
              </div>
            )}
            <span className="text-sm font-medium text-gray-900 dark:text-white max-w-[120px] truncate">
              {currentWorkspace.name}
            </span>
          </>
        ) : (
          <>
            <Building2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-500">Select Workspace</span>
          </>
        )}
        <ChevronDown
          className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-[500px] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl z-50"
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Your Workspaces ({workspaces.length})
                </div>
                {showCreateOption && (
                  <button
                    onClick={handleCreateWorkspace}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    + New Workspace
                  </button>
                )}
              </div>

              {/* Loading State */}
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : workspaces.length === 0 ? (
                /* Empty State */
                <div className="text-center py-8">
                  <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    No workspaces yet
                  </p>
                  {showCreateOption && (
                    <button
                      onClick={handleCreateWorkspace}
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Your First Workspace</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Workspaces List */
                <>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {workspaces.map((workspace) => {
                      const isSelected = currentWorkspace?.id === workspace.id;
                      const isOwner = workspace.user_role === 'owner';

                      return (
                        <button
                          key={workspace.id}
                          onClick={() => handleWorkspaceSelect(workspace)}
                          className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-all group ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500/50'
                              : ''
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {/* Workspace Icon */}
                            {workspace.logo ? (
                              <img
                                src={workspace.logo}
                                alt={workspace.name}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                style={{ backgroundColor: getWorkspaceColor(workspace) }}
                              >
                                {getWorkspaceInitials(workspace)}
                              </div>
                            )}

                            {/* Workspace Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {workspace.name}
                                </div>
                                {isOwner && (
                                  <Crown className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {workspace.member_count || 0} members
                                </span>
                                <span className="text-gray-400">•</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {workspace.project_count || 0} projects
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Selection Indicator */}
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Actions */}
                  {currentWorkspace && (
                    <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
                      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Quick Actions
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleWorkspaceSettings(currentWorkspace.id)}
                          className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        >
                          <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Settings</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsOpen(false);
                            navigate(`/workspace/${currentWorkspace.id}/members`);
                          }}
                          className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        >
                          <Users className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Members</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsOpen(false);
                            navigate(`/workspace/${currentWorkspace.id}/analytics`);
                          }}
                          className="flex flex-col items-center space-y-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                        >
                          <BarChart3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">Analytics</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Create Workspace Button */}
              {showCreateOption && workspaces.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4">
                  <button
                    onClick={handleCreateWorkspace}
                    className="flex items-center space-x-2 w-full px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:from-blue-100 hover:to-purple-100 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30 transition-all text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create New Workspace</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkspaceSelector;
