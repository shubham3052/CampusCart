import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckSquare,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Pin,
  Archive,
  ShoppingBag,
  Printer,
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  CheckCircle2,
  BookOpen,
  ListChecks,
  Layers,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import plannerService from '../../services/plannerService';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';

const CATEGORIES_TASK = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'STUDY', label: 'Study & Revision' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'PROJECT', label: 'Project & Report' },
  { value: 'EXAM', label: 'Examination' },
  { value: 'LAB', label: 'Lab & Practical' },
  { value: 'SHOPPING', label: 'Shopping & Supplies' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'OTHER', label: 'Other' },
];

const PRIORITIES = [
  { value: 'ALL', label: 'All Priorities' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const NOTE_COLORS = [
  { hex: '#ffffff', name: 'Clean White' },
  { hex: '#fef3c7', name: 'Warm Amber' },
  { hex: '#e0e7ff', name: 'Indigo Mist' },
  { hex: '#dcfce7', name: 'Mint Green' },
  { hex: '#fce7f3', name: 'Rose Blossom' },
  { hex: '#f3e8ff', name: 'Soft Purple' },
];

const StudentPlanner = () => {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const navigate = useNavigate();

  // Active Tab: 'overview' | 'tasks' | 'notes' | 'shopping' | 'checklists'
  const [activeTab, setActiveTab] = useState('overview');

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('success');

  // Summary & Overview Data
  const [summary, setSummary] = useState(null);

  // Tasks Tab State
  const [tasks, setTasks] = useState([]);
  const [taskFilterStatus, setTaskFilterStatus] = useState('ALL'); // ALL, TODAY, UPCOMING, OVERDUE, COMPLETED
  const [taskCategory, setTaskCategory] = useState('ALL');
  const [taskPriority, setTaskPriority] = useState('ALL');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskSort, setTaskSort] = useState('due_date');

  // Task Modal State
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    category: 'STUDY',
    priority: 'MEDIUM',
    due_date: '',
    due_time: '',
    academic_event: '',
    suggest_supplies: true,
  });

  // Notes Tab State
  const [notes, setNotes] = useState([]);
  const [noteCategory, setNoteCategory] = useState('ALL');
  const [noteSearch, setNoteSearch] = useState('');
  const [showArchivedNotes, setShowArchivedNotes] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteFormData, setNoteFormData] = useState({
    title: '',
    subject: '',
    content: '',
    category: 'GENERAL',
    color: '#ffffff',
    is_pinned: false,
  });

  // Shopping List State
  const [shoppingLists, setShoppingLists] = useState([]);
  const [activeListId, setActiveListId] = useState(null);
  const [newListItemTitle, setNewListItemTitle] = useState('');
  const [newListItemQty, setNewListItemQty] = useState(1);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Checklists State
  const [checklists, setChecklists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newChecklistItemTitle, setNewChecklistItemTitle] = useState({});

  // Show Toast
  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // --------------------------------------------------------------------------
  // Fetch All Initial Data
  // --------------------------------------------------------------------------
  const loadPlannerData = async () => {
    setLoading(true);
    try {
      const [sumRes, tasksRes, notesRes, listsRes, checksRes, tplRes] = await Promise.all([
        plannerService.getOverview().catch(() => null),
        plannerService.getTasks().catch(() => []),
        plannerService.getNotes().catch(() => []),
        plannerService.getShoppingLists().catch(() => []),
        plannerService.getChecklists().catch(() => []),
        plannerService.getChecklistTemplates().catch(() => ({ templates: [] })),
      ]);

      if (sumRes && sumRes.success) {
        setSummary(sumRes);
      }
      setTasks(Array.isArray(tasksRes) ? tasksRes : (tasksRes.results || []));
      setNotes(Array.isArray(notesRes) ? notesRes : (notesRes.results || []));
      
      const sLists = Array.isArray(listsRes) ? listsRes : (listsRes.results || []);
      setShoppingLists(sLists);
      if (sLists.length > 0 && !activeListId) {
        setActiveListId(sLists[0].id);
      }

      setChecklists(Array.isArray(checksRes) ? checksRes : (checksRes.results || []));
      setTemplates(tplRes?.templates || []);
    } catch (err) {
      console.error('Failed to load planner details:', err);
      showToast('Some planner data could not be retrieved. Refresh to try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlannerData();
  }, []);

  // Active shopping list instance
  const activeShoppingList = useMemo(() => {
    return shoppingLists.find((l) => l.id === activeListId) || shoppingLists[0] || null;
  }, [shoppingLists, activeListId]);

  // --------------------------------------------------------------------------
  // Tasks Actions
  // --------------------------------------------------------------------------
  const handleToggleTaskComplete = async (taskId) => {
    try {
      const res = await plannerService.toggleTaskComplete(taskId);
      if (res.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...res.task } : t))
        );
        showToast(res.message);
        // Refresh summary progress
        plannerService.getOverview().then((data) => data.success && setSummary(data));
      }
    } catch (err) {
      showToast('Could not update task state.', 'error');
    }
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!taskFormData.title.trim()) {
      showToast('Please provide a title for your task.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        title: taskFormData.title.trim(),
        description: taskFormData.description.trim(),
        category: taskFormData.category,
        priority: taskFormData.priority,
        due_date: taskFormData.due_date || null,
        due_time: taskFormData.due_time || null,
        academic_event: taskFormData.academic_event || null,
      };

      const newTask = await plannerService.createTask(payload);
      setTasks((prev) => [newTask, ...prev]);
      setIsTaskModalOpen(false);
      showToast(`Task "${newTask.title}" added to planner!`);

      // Reset form
      setTaskFormData({
        title: '',
        description: '',
        category: 'STUDY',
        priority: 'MEDIUM',
        due_date: '',
        due_time: '',
        academic_event: '',
        suggest_supplies: true,
      });

      // Refresh overview
      plannerService.getOverview().then((data) => data.success && setSummary(data));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create task.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await plannerService.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast('Task removed.');
      plannerService.getOverview().then((data) => data.success && setSummary(data));
    } catch (err) {
      showToast('Could not delete task.', 'error');
    }
  };

  // Add individual or all suggested tasks
  const handleAddSuggestedTask = async (suggestedItem) => {
    try {
      const res = await plannerService.createSuggestedTasks([suggestedItem]);
      if (res.success) {
        showToast(`Added suggested task: "${suggestedItem.title}"`);
        loadPlannerData();
      }
    } catch (err) {
      showToast('Failed to add suggested task.', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Notes Actions
  // --------------------------------------------------------------------------
  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteFormData.title.trim()) {
      showToast('Please enter a note title.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      if (editingNoteId) {
        const updated = await plannerService.updateNote(editingNoteId, noteFormData);
        setNotes((prev) => prev.map((n) => (n.id === editingNoteId ? updated : n)));
        showToast('Note updated.');
      } else {
        const created = await plannerService.createNote(noteFormData);
        setNotes((prev) => [created, ...prev]);
        showToast('New note created.');
      }
      setIsNoteModalOpen(false);
      setEditingNoteId(null);
      setNoteFormData({
        title: '',
        subject: '',
        content: '',
        category: 'GENERAL',
        color: '#ffffff',
        is_pinned: false,
      });
    } catch (err) {
      showToast('Failed to save note.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePinNote = async (note) => {
    try {
      const res = note.is_pinned
        ? await plannerService.unpinNote(note.id)
        : await plannerService.pinNote(note.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? res.note : n)));
      showToast(res.message);
    } catch (err) {
      showToast('Could not update note pin state.', 'error');
    }
  };

  const handleToggleArchiveNote = async (note) => {
    try {
      const res = note.is_archived
        ? await plannerService.unarchiveNote(note.id)
        : await plannerService.archiveNote(note.id);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? res.note : n)));
      showToast(res.message);
    } catch (err) {
      showToast('Could not update archive state.', 'error');
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await plannerService.deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      showToast('Note deleted.');
    } catch (err) {
      showToast('Could not delete note.', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Shopping List Actions
  // --------------------------------------------------------------------------
  const handleCreateShoppingList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const created = await plannerService.createShoppingList(newListName.trim());
      setShoppingLists((prev) => [created, ...prev]);
      setActiveListId(created.id);
      setNewListName('');
      setIsCreatingList(false);
      showToast(`Shopping list "${created.name}" created.`);
    } catch (err) {
      showToast('Failed to create shopping list.', 'error');
    }
  };

  const handleAddCustomShoppingItem = async (e) => {
    e.preventDefault();
    if (!activeShoppingList || !newListItemTitle.trim()) return;

    try {
      const res = await plannerService.addShoppingListItem(activeShoppingList.id, {
        custom_item_name: newListItemTitle.trim(),
        quantity: newListItemQty,
        priority: 'MEDIUM',
      });
      if (res.success) {
        // Refresh active list
        const updatedLists = await plannerService.getShoppingLists();
        setShoppingLists(updatedLists);
        setNewListItemTitle('');
        setNewListItemQty(1);
        showToast(`Added "${newListItemTitle.trim()}" to list.`);
      }
    } catch (err) {
      showToast('Could not add item to list.', 'error');
    }
  };

  const handleToggleShoppingItem = async (itemId, currentVal) => {
    if (!activeShoppingList) return;
    try {
      await plannerService.updateShoppingListItem(activeShoppingList.id, {
        item_id: itemId,
        is_checked: !currentVal,
      });
      const updatedLists = await plannerService.getShoppingLists();
      setShoppingLists(updatedLists);
    } catch (err) {
      showToast('Failed to update item checkmark.', 'error');
    }
  };

  const handleRemoveShoppingItem = async (itemId) => {
    if (!activeShoppingList) return;
    try {
      await plannerService.removeShoppingListItem(activeShoppingList.id, itemId);
      const updatedLists = await plannerService.getShoppingLists();
      setShoppingLists(updatedLists);
      showToast('Item removed from shopping list.');
    } catch (err) {
      showToast('Failed to delete item.', 'error');
    }
  };

  const handleClearCompletedShoppingItems = async () => {
    if (!activeShoppingList) return;
    try {
      const res = await plannerService.clearCompletedShoppingItems(activeShoppingList.id);
      const updatedLists = await plannerService.getShoppingLists();
      setShoppingLists(updatedLists);
      showToast(res.message);
    } catch (err) {
      showToast('Failed to clear completed items.', 'error');
    }
  };

  // Add Smart Suggestion directly to shopping list
  const handleAddSuggestionToShoppingList = async (sugg) => {
    let targetList = activeShoppingList;
    if (!targetList && shoppingLists.length > 0) {
      targetList = shoppingLists[0];
    }

    if (!targetList) {
      // Create a default list
      try {
        targetList = await plannerService.createShoppingList('My Semester Supplies');
        setShoppingLists([targetList]);
        setActiveListId(targetList.id);
      } catch (err) {
        showToast('Please create a shopping list first.', 'error');
        return;
      }
    }

    try {
      const payload = sugg.product_id
        ? {
            product_id: sugg.product_id,
            quantity: 1,
            source: sugg.source || 'ACADEMIC',
            priority: 'HIGH',
          }
        : {
            custom_item_name: sugg.name,
            service_type: sugg.service_type || 'PRINTING',
            quantity: 1,
            source: 'TASK',
            priority: 'HIGH',
          };

      const res = await plannerService.addShoppingListItem(targetList.id, payload);
      if (res.success) {
        const updatedLists = await plannerService.getShoppingLists();
        setShoppingLists(updatedLists);
        showToast(`Added "${sugg.name}" to ${targetList.name}!`);
      }
    } catch (err) {
      showToast('Failed to add supply to shopping list.', 'error');
    }
  };

  // Add All Available items from shopping list or suggestions to Cart with backend stock check
  const handleAddItemsToCart = async (items) => {
    if (!items || items.length === 0) {
      showToast('No items to add to cart.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await plannerService.validateAndAddToCart(items);
      if (res.success) {
        let addedCount = 0;
        for (const validItem of res.valid_items) {
          const productObj = {
            id: validItem.productId,
            name: validItem.productName,
            shop_id: validItem.shopId,
            shop_name: validItem.shopName,
            price: validItem.price,
            current_stock: validItem.current_stock,
          };
          const cartRes = addToCart(productObj, validItem.quantity);
          if (cartRes.success) {
            addedCount += 1;
          }
        }

        if (res.unavailable_items?.length > 0) {
          showToast(
            `${addedCount} items added to cart. ${res.unavailable_items.length} item(s) could not be added because they are out of stock.`,
            'warning'
          );
        } else {
          showToast(`Successfully added ${addedCount} items to your shopping cart!`);
        }
      } else {
        showToast(res.message || 'Items could not be added to cart.', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add items to cart.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // --------------------------------------------------------------------------
  // Checklists Actions
  // --------------------------------------------------------------------------
  const handleCreateChecklistFromTemplate = async (templateId) => {
    try {
      const res = await plannerService.createFromTemplate(templateId);
      if (res.success) {
        setChecklists((prev) => [res.checklist, ...prev]);
        showToast(res.message);
      }
    } catch (err) {
      showToast('Failed to create checklist from template.', 'error');
    }
  };

  const handleToggleChecklistItem = async (checklistId, itemId, currentVal) => {
    try {
      const res = await plannerService.toggleChecklistItem(checklistId, itemId, !currentVal);
      if (res.success) {
        setChecklists((prev) =>
          prev.map((c) => {
            if (c.id !== checklistId) return c;
            return {
              ...c,
              progress_percentage: res.checklist_progress,
              items: c.items.map((i) => (i.id === itemId ? res.item : i)),
            };
          })
        );
      }
    } catch (err) {
      showToast('Could not update checklist item.', 'error');
    }
  };

  const handleAddChecklistItem = async (checklistId) => {
    const title = newChecklistItemTitle[checklistId];
    if (!title || !title.trim()) return;

    try {
      const res = await plannerService.addChecklistItem(checklistId, { title: title.trim() });
      if (res.success) {
        setChecklists((prev) =>
          prev.map((c) => (c.id === checklistId ? { ...c, items: [...c.items, res.item] } : c))
        );
        setNewChecklistItemTitle((prev) => ({ ...prev, [checklistId]: '' }));
        showToast('Item added to checklist.');
      }
    } catch (err) {
      showToast('Failed to add item.', 'error');
    }
  };

  const handleDeleteChecklist = async (checklistId) => {
    try {
      await plannerService.deleteChecklist(checklistId);
      setChecklists((prev) => prev.filter((c) => c.id !== checklistId));
      showToast('Checklist removed.');
    } catch (err) {
      showToast('Could not delete checklist.', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Filtered & Sorted Tasks
  // --------------------------------------------------------------------------
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Status Filter
      if (taskFilterStatus === 'TODAY' && task.due_status !== 'DUE_TODAY') return false;
      if (taskFilterStatus === 'UPCOMING' && task.due_status !== 'UPCOMING' && task.due_status !== 'DUE_TOMORROW') return false;
      if (taskFilterStatus === 'OVERDUE' && !task.is_overdue) return false;
      if (taskFilterStatus === 'COMPLETED' && task.status !== 'COMPLETED') return false;

      // Category Filter
      if (taskCategory !== 'ALL' && task.category !== taskCategory) return false;

      // Priority Filter
      if (taskPriority !== 'ALL' && task.priority !== taskPriority) return false;

      // Search Query
      if (taskSearch.trim()) {
        const q = taskSearch.toLowerCase();
        const matchesTitle = task.title?.toLowerCase().includes(q);
        const matchesDesc = task.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }

      return true;
    });
  }, [tasks, taskFilterStatus, taskCategory, taskPriority, taskSearch]);

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (noteCategory !== 'ALL' && note.category !== noteCategory) return false;
      if (!showArchivedNotes && note.is_archived) return false;
      if (showArchivedNotes && !note.is_archived) return false;
      if (noteSearch.trim()) {
        const q = noteSearch.toLowerCase();
        const matchesTitle = note.title?.toLowerCase().includes(q);
        const matchesContent = note.content?.toLowerCase().includes(q);
        const matchesSubject = note.subject?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesContent && !matchesSubject) return false;
      }
      return true;
    });
  }, [notes, noteCategory, showArchivedNotes, noteSearch]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Loader size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            backgroundColor: toastType === 'error' ? 'var(--danger-600, #dc2626)' : (toastType === 'warning' ? '#d97706' : '#16a34a'),
            color: '#ffffff',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.9rem',
            fontWeight: 500,
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '1.75rem',
          color: '#ffffff',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          boxShadow: '0 4px 20px rgba(79, 70, 229, 0.25)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Sparkles size={20} color="#fbbf24" />
            <span style={{ fontSize: '0.8rem', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700, color: '#e0e7ff' }}>
              Intelligent Student Assistant
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Smart Planner & Study Organizer
          </h1>
          <p style={{ margin: '0.35rem 0 0 0', opacity: 0.9, fontSize: '0.95rem' }}>
            Unify tasks, deadlines, academic events, stationery needs, and printing workflows in one place.
          </p>
        </div>

        {/* Quick Action Button */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            onClick={() => setIsTaskModalOpen(true)}
            style={{ backgroundColor: '#ffffff', color: '#4f46e5', fontWeight: 700 }}
          >
            <Plus size={16} style={{ marginRight: '0.4rem' }} /> Add Task
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEditingNoteId(null);
              setNoteFormData({
                title: '',
                subject: '',
                content: '',
                category: 'GENERAL',
                color: '#ffffff',
                is_pinned: false,
              });
              setIsNoteModalOpen(true);
            }}
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.4)', fontWeight: 600 }}
          >
            <BookOpen size={16} style={{ marginRight: '0.4rem' }} /> Quick Note
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
        }}
      >
        {[
          { key: 'overview', label: 'Overview & Intelligence', icon: Layers },
          { key: 'tasks', label: `Tasks (${tasks.length})`, icon: CheckSquare },
          { key: 'notes', label: `Personal Notes (${notes.length})`, icon: BookOpen },
          { key: 'shopping', label: 'Shopping List', icon: ShoppingBag },
          { key: 'checklists', label: 'Academic Checklists', icon: ListChecks },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.15rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                color: isActive ? 'var(--primary-600, #4f46e5)' : 'var(--text-secondary, #64748b)',
                borderBottom: isActive ? '3px solid var(--primary-600, #4f46e5)' : '3px solid transparent',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: OVERVIEW & INTELLIGENCE */}
      {/* ==================================================================== */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Top Progress & Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
            <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>DUE TODAY</span>
                <h3 style={{ margin: '0.1rem 0 0 0', fontSize: '1.5rem', fontWeight: 800 }}>{summary?.counts?.today || 0}</h3>
              </div>
            </Card>

            <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>UPCOMING DEADLINES</span>
                <h3 style={{ margin: '0.1rem 0 0 0', fontSize: '1.5rem', fontWeight: 800 }}>{summary?.counts?.upcoming || 0}</h3>
              </div>
            </Card>

            <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>OVERDUE TASKS</span>
                <h3 style={{ margin: '0.1rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: (summary?.counts?.overdue || 0) > 0 ? '#dc2626' : 'inherit' }}>
                  {summary?.counts?.overdue || 0}
                </h3>
              </div>
            </Card>

            <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #64748b)', fontWeight: 600 }}>ACADEMIC PREPARATION</span>
                <h3 style={{ margin: '0.1rem 0 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#16a34a' }}>
                  {summary?.progress?.overall_academic_readiness_pct || 0}%
                </h3>
              </div>
            </Card>
          </div>

          {/* Imminent Academic Events Banner */}
          {summary?.academic_events?.length > 0 && (
            <Card style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={18} color="#6366f1" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Approaching Academic Milestones</h3>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>From Official Academic Calendar</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {summary.academic_events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{ev.title}</span>
                      <Badge variant={ev.importance === 'CRITICAL' ? 'danger' : 'warning'}>
                        {ev.days_until > 0 ? `In ${ev.days_until} days` : 'Active Now'}
                      </Badge>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {ev.event_type_display} • {ev.start_date}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Smart Suggestions: "What You May Need" */}
          <Card style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>WHAT YOU MAY NEED</h2>
                </div>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Intelligent recommendations calculated from your upcoming tasks, project submissions, and exam schedules.
                </p>
              </div>

              {summary?.smart_suggestions?.some((s) => s.type === 'PRODUCT') && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const validProducts = summary.smart_suggestions
                      .filter((s) => s.type === 'PRODUCT')
                      .map((s) => ({ product_id: s.product_id, quantity: 1, name: s.name }));
                    handleAddItemsToCart(validProducts);
                  }}
                  disabled={actionLoading}
                >
                  <ShoppingBag size={15} style={{ marginRight: '0.35rem' }} /> Add All to Cart
                </Button>
              )}
            </div>

            {summary?.smart_suggestions?.length === 0 ? (
              <EmptyState
                title="No Pending Supplies Needed"
                description="You are currently all set! As new tasks or exams approach, relevant stationery suggestions will appear here."
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                {summary?.smart_suggestions?.map((sugg) => (
                  <div
                    key={sugg.id}
                    style={{
                      border: '1px solid var(--border-light, #e2e8f0)',
                      borderRadius: '10px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      backgroundColor: sugg.type === 'SERVICE' ? '#f0fdf4' : '#ffffff',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{sugg.name}</span>
                        <Badge variant={sugg.type === 'SERVICE' ? 'success' : 'primary'}>
                          {sugg.type === 'SERVICE' ? 'Service' : `₹${sugg.price.toFixed(2)}`}
                        </Badge>
                      </div>
                      <p style={{ margin: '0.4rem 0', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                        {sugg.reason}
                      </p>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Available at: <strong>{sugg.shop_name}</strong>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {sugg.type === 'SERVICE' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          fullWidth
                          onClick={() => navigate('/student/printing')}
                        >
                          <Printer size={14} style={{ marginRight: '0.35rem' }} /> Start Printing
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ flex: 1 }}
                            onClick={() => handleAddSuggestionToShoppingList(sugg)}
                          >
                            + To List
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            style={{ flex: 1 }}
                            onClick={() => handleAddItemsToCart([{ product_id: sugg.product_id, quantity: 1, name: sugg.name }])}
                            disabled={actionLoading}
                          >
                            Add to Cart
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Automatic Academic Task Suggestions */}
          {summary?.suggested_tasks?.length > 0 && (
            <Card style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ListChecks size={18} color="#4f46e5" />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Suggested Academic Tasks</h3>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    plannerService.createSuggestedTasks(summary.suggested_tasks).then((res) => {
                      if (res.success) {
                        showToast(`Added ${res.created_tasks.length} suggested tasks!`);
                        loadPlannerData();
                      }
                    });
                  }}
                >
                  Add All Tasks
                </Button>
              </div>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                AI-derived preparation steps based on your upcoming academic deadlines. Click [Add Task] to confirm.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {summary.suggested_tasks.map((st) => (
                  <div
                    key={st.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                      border: '1px solid var(--border-light, #e2e8f0)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{st.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Due by: {st.due_date} • {st.reason}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleAddSuggestedTask(st)}>
                      + Add Task
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Buy Again Strip */}
          {summary?.buy_again?.length > 0 && (
            <Card style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.05rem', fontWeight: 700 }}>
                🔁 Previously Purchased Items You May Need Again
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {summary.buy_again.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.75rem',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>₹{parseFloat(item.price).toFixed(2)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                        onClick={() => handleAddSuggestionToShoppingList({ product_id: item.id, name: item.name, source: 'BUY_AGAIN' })}
                      >
                        + To List
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        style={{ flex: 1, fontSize: '0.75rem' }}
                        onClick={() => handleAddItemsToCart([{ product_id: item.id, quantity: 1, name: item.name }])}
                      >
                        Add to Cart
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: TASKS */}
      {/* ==================================================================== */}
      {activeTab === 'tasks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { key: 'ALL', label: 'All' },
                { key: 'TODAY', label: 'Due Today' },
                { key: 'UPCOMING', label: 'Upcoming' },
                { key: 'OVERDUE', label: 'Overdue' },
                { key: 'COMPLETED', label: 'Completed' },
              ].map((pill) => (
                <button
                  key={pill.key}
                  onClick={() => setTaskFilterStatus(pill.key)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: taskFilterStatus === pill.key ? '#4f46e5' : 'var(--border-light, #e2e8f0)',
                    backgroundColor: taskFilterStatus === pill.key ? '#4f46e5' : '#ffffff',
                    color: taskFilterStatus === pill.key ? '#ffffff' : '#475569',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Search and Modal Trigger */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem 0.45rem 2rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
              <Button size="sm" variant="primary" onClick={() => setIsTaskModalOpen(true)}>
                <Plus size={16} style={{ marginRight: '0.3rem' }} /> New Task
              </Button>
            </div>
          </div>

          {/* Task List */}
          {filteredTasks.length === 0 ? (
            <EmptyState
              title="No Tasks Found"
              description="No tasks match the active filters. Create a new task to get organized."
              actionLabel="Create Task"
              onAction={() => setIsTaskModalOpen(true)}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredTasks.map((task) => {
                const isOverdue = task.is_overdue;
                const isDone = task.completed || task.status === 'COMPLETED';

                return (
                  <Card
                    key={task.id}
                    style={{
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: isDone ? '4px solid #16a34a' : isOverdue ? '4px solid #dc2626' : '4px solid #6366f1',
                      opacity: isDone ? 0.75 : 1,
                    }}
                  >
                    {/* Left: Checkbox & Details */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        onChange={() => handleToggleTaskComplete(task.id)}
                        style={{ width: '20px', height: '20px', marginTop: '0.2rem', cursor: 'pointer', accentColor: '#4f46e5' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '1rem',
                              textDecoration: isDone ? 'line-through' : 'none',
                              color: isDone ? '#64748b' : 'inherit',
                            }}
                          >
                            {task.title}
                          </span>
                          <Badge variant={task.priority === 'URGENT' ? 'danger' : task.priority === 'HIGH' ? 'warning' : 'primary'}>
                            {task.priority}
                          </Badge>
                          <Badge variant="secondary">{task.category}</Badge>
                        </div>
                        {task.description && (
                          <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                            {task.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                          {task.due_date && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: isOverdue ? '#dc2626' : 'inherit', fontWeight: isOverdue ? 700 : 500 }}>
                              <Clock size={14} />
                              {isOverdue
                                ? `Overdue by ${Math.abs(task.days_remaining)} days (${task.due_date})`
                                : task.due_status === 'DUE_TODAY'
                                ? 'Due today!'
                                : task.due_status === 'DUE_TOMORROW'
                                ? 'Due tomorrow'
                                : `Due in ${task.days_remaining} days (${task.due_date})`}
                            </span>
                          )}
                          {task.academic_event_title && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#6366f1' }}>
                              <Sparkles size={14} /> Linked: {task.academic_event_title}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '0.4rem',
                          borderRadius: '4px',
                        }}
                        title="Delete task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: NOTES */}
      {/* ==================================================================== */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header & Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search notes..."
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem',
                }}
              />
              <button
                onClick={() => setShowArchivedNotes(!showArchivedNotes)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: showArchivedNotes ? '#f1f5f9' : '#ffffff',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <Archive size={15} />
                <span>{showArchivedNotes ? 'Viewing Archived' : 'Show Archived'}</span>
              </button>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setEditingNoteId(null);
                setNoteFormData({
                  title: '',
                  subject: '',
                  content: '',
                  category: 'GENERAL',
                  color: '#ffffff',
                  is_pinned: false,
                });
                setIsNoteModalOpen(true);
              }}
            >
              <Plus size={16} style={{ marginRight: '0.3rem' }} /> Create Note
            </Button>
          </div>

          {/* Notes Grid */}
          {filteredNotes.length === 0 ? (
            <EmptyState
              title={showArchivedNotes ? 'No Archived Notes' : 'No Notes Yet'}
              description={showArchivedNotes ? 'No archived notes found.' : 'Keep quick memos, revision flashcards, or textbook summaries right here.'}
              actionLabel="Create First Note"
              onAction={() => setIsNoteModalOpen(true)}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    backgroundColor: note.color || '#ffffff',
                    border: '1px solid var(--border-light, #e2e8f0)',
                    borderRadius: '12px',
                    padding: '1.15rem',
                    boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                    position: 'relative',
                  }}
                >
                  <div>
                    {/* Note Top Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>{note.title}</span>
                      <button
                        onClick={() => handleTogglePinNote(note)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: note.is_pinned ? '#4f46e5' : '#94a3b8',
                          padding: '2px',
                        }}
                        title={note.is_pinned ? 'Unpin Note' : 'Pin Note'}
                      >
                        <Pin size={16} style={{ fill: note.is_pinned ? '#4f46e5' : 'none' }} />
                      </button>
                    </div>

                    {note.subject && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase' }}>
                        {note.subject}
                      </span>
                    )}

                    <p style={{ margin: '0.6rem 0', fontSize: '0.85rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {note.content}
                    </p>
                  </div>

                  {/* Footer & Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{note.category_display || note.category}</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setNoteFormData({
                            title: note.title,
                            subject: note.subject || '',
                            content: note.content,
                            category: note.category,
                            color: note.color || '#ffffff',
                            is_pinned: note.is_pinned,
                          });
                          setIsNoteModalOpen(true);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        title="Edit note"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleArchiveNote(note)}
                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        title={note.is_archived ? 'Unarchive' : 'Archive'}
                      >
                        <Archive size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: SHOPPING LIST */}
      {/* ==================================================================== */}
      {activeTab === 'shopping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Shopping Lists Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Active List:</span>
              <select
                value={activeListId || ''}
                onChange={(e) => setActiveListId(Number(e.target.value))}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                {shoppingLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.items?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button size="sm" variant="secondary" onClick={() => setIsCreatingList(true)}>
                + New List
              </Button>
              {activeShoppingList?.items?.some((i) => i.is_checked) && (
                <Button size="sm" variant="outline" onClick={handleClearCompletedShoppingItems}>
                  Clear Completed
                </Button>
              )}
              {activeShoppingList?.items?.length > 0 && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    const itemsPayload = activeShoppingList.items.map((i) => ({
                      product_id: i.product?.id || i.product,
                      quantity: i.quantity,
                      name: i.item_name,
                    }));
                    handleAddItemsToCart(itemsPayload);
                  }}
                  disabled={actionLoading}
                >
                  <ShoppingBag size={15} style={{ marginRight: '0.35rem' }} /> Add Available to Cart
                </Button>
              )}
            </div>
          </div>

          {/* New List Inline Form Modal */}
          {isCreatingList && (
            <Card style={{ padding: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="List name (e.g. Semester 6 Project Supplies)"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
              <Button size="sm" variant="primary" onClick={handleCreateShoppingList}>
                Save List
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setIsCreatingList(false)}>
                Cancel
              </Button>
            </Card>
          )}

          {/* Active List Items */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                {activeShoppingList?.name || 'My Shopping List'}
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Est. Total: ₹{(activeShoppingList?.total_estimated_cost || 0).toFixed(2)}
              </span>
            </div>

            {/* Quick Add Custom Item Form */}
            <form onSubmit={handleAddCustomShoppingItem} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                placeholder="Add stationery item or service need..."
                value={newListItemTitle}
                onChange={(e) => setNewListItemTitle(e.target.value)}
                style={{ flex: 1, padding: '0.45rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
              <input
                type="number"
                min="1"
                max="99"
                value={newListItemQty}
                onChange={(e) => setNewListItemQty(Number(e.target.value))}
                style={{ width: '60px', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}
              />
              <Button size="sm" variant="primary" type="submit">
                Add Item
              </Button>
            </form>

            {/* Items Table */}
            {activeShoppingList?.items?.length === 0 ? (
              <EmptyState
                title="Your List is Empty"
                description="Use the input above to list items or click 'Add to Shopping List' from the Smart Suggestions tab."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {activeShoppingList?.items?.map((item) => {
                  const isChecked = item.is_checked;
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        backgroundColor: isChecked ? '#f8fafc' : '#ffffff',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        opacity: isChecked ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleShoppingItem(item.id, isChecked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#4f46e5' }}
                        />
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: isChecked ? 'line-through' : 'none' }}>
                            {item.item_name}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>
                            × {item.quantity}
                          </span>
                          {item.product_details && (
                            <div style={{ fontSize: '0.75rem', color: '#4f46e5' }}>
                              ₹{parseFloat(item.product_details.price).toFixed(2)} • {item.product_details.shop_name}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Badge variant={item.priority === 'URGENT' ? 'danger' : 'secondary'}>{item.priority}</Badge>
                        <button
                          onClick={() => handleRemoveShoppingItem(item.id)}
                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: ACADEMIC CHECKLISTS */}
      {/* ==================================================================== */}
      {activeTab === 'checklists' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Predefined Templates Drawer */}
          {templates.length > 0 && (
            <Card style={{ padding: '1.25rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Sparkles size={18} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Semester Preparation Templates</h3>
              </div>
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                Quick-start standardized checklists for semester opening, major project submissions, and examinations.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      padding: '1rem',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem', fontWeight: 800 }}>{tpl.title}</h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>{tpl.description}</p>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#4f46e5', fontWeight: 600 }}>
                        {tpl.items.length} milestone steps
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => handleCreateChecklistFromTemplate(tpl.id)}>
                      Use Template
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Student Checklists */}
          {checklists.length === 0 ? (
            <EmptyState
              title="No Active Checklists"
              description="Choose a semester template above to instantly create your preparation milestone checklist."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {checklists.map((chk) => (
                <Card key={chk.id} style={{ padding: '1.25rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{chk.title}</h3>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {chk.completed_items || 0} of {chk.total_items || 0} completed ({chk.progress_percentage || 0}%)
                      </span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteChecklist(chk.id)}>
                      <Trash2 size={14} style={{ marginRight: '0.25rem' }} /> Remove
                    </Button>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                    <div
                      style={{
                        width: `${chk.progress_percentage || 0}%`,
                        height: '100%',
                        backgroundColor: chk.progress_percentage === 100 ? '#16a34a' : '#4f46e5',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Items List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {chk.items?.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          backgroundColor: item.is_completed ? '#f8fafc' : '#ffffff',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={item.is_completed}
                          onChange={() => handleToggleChecklistItem(chk.id, item.id, item.is_completed)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#4f46e5' }}
                        />
                        <span
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            textDecoration: item.is_completed ? 'line-through' : 'none',
                            color: item.is_completed ? '#94a3b8' : '#334155',
                          }}
                        >
                          {item.title}
                        </span>
                        {item.item_type && (
                          <Badge variant={item.item_type === 'PRINTING' ? 'success' : 'secondary'} size="sm">
                            {item.item_type}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Item form */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Add milestone step..."
                      value={newChecklistItemTitle[chk.id] || ''}
                      onChange={(e) =>
                        setNewChecklistItemTitle({ ...newChecklistItemTitle, [chk.id]: e.target.value })
                      }
                      style={{ flex: 1, padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                    <Button size="sm" variant="secondary" onClick={() => handleAddChecklistItem(chk.id)}>
                      + Add
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TASK MODAL */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Create New Academic Task"
      >
        <form onSubmit={handleSaveTask} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Task Title *
            </label>
            <Input
              placeholder="e.g. Submit DBMS Project Report"
              value={taskFormData.title}
              onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Description / Notes
            </label>
            <textarea
              placeholder="Add key requirements, report format or faculty instructions..."
              value={taskFormData.description}
              onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #e2e8f0)',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Category
              </label>
              <Select
                options={CATEGORIES_TASK.filter((c) => c.value !== 'ALL')}
                value={taskFormData.category}
                onChange={(e) => setTaskFormData({ ...taskFormData, category: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Priority
              </label>
              <Select
                options={PRIORITIES.filter((p) => p.value !== 'ALL')}
                value={taskFormData.priority}
                onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Due Date
              </label>
              <Input
                type="date"
                value={taskFormData.due_date}
                onChange={(e) => setTaskFormData({ ...taskFormData, due_date: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Due Time (Optional)
              </label>
              <Input
                type="time"
                value={taskFormData.due_time}
                onChange={(e) => setTaskFormData({ ...taskFormData, due_time: e.target.value })}
              />
            </div>
          </div>

          {summary?.academic_events?.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Link to Academic Event (Optional)
              </label>
              <select
                value={taskFormData.academic_event}
                onChange={(e) => setTaskFormData({ ...taskFormData, academic_event: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light, #e2e8f0)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">-- No Academic Event Linked --</option>
                {summary.academic_events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.start_date})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={actionLoading}>
              Save Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* NOTE MODAL */}
      {/* ==================================================================== */}
      <Modal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        title={editingNoteId ? 'Edit Study Note' : 'Create New Study Note'}
      >
        <form onSubmit={handleSaveNote} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Title *
            </label>
            <Input
              placeholder="e.g. DBMS Unit 3 Key Concepts"
              value={noteFormData.title}
              onChange={(e) => setNoteFormData({ ...noteFormData, title: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Subject (Optional)
              </label>
              <Input
                placeholder="e.g. DBMS / Math"
                value={noteFormData.subject}
                onChange={(e) => setNoteFormData({ ...noteFormData, subject: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                Category
              </label>
              <Select
                options={CATEGORIES_TASK.filter((c) => c.value !== 'ALL')}
                value={noteFormData.category}
                onChange={(e) => setNoteFormData({ ...noteFormData, category: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              Note Content
            </label>
            <textarea
              placeholder="Type your lecture notes, formulas, summary or memo..."
              value={noteFormData.content}
              onChange={(e) => setNoteFormData({ ...noteFormData, content: e.target.value })}
              rows={5}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-light, #e2e8f0)',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
              required
            />
          </div>

          {/* Color Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Card Color
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {NOTE_COLORS.map((col) => (
                <button
                  key={col.hex}
                  type="button"
                  onClick={() => setNoteFormData({ ...noteFormData, color: col.hex })}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: col.hex,
                    border: noteFormData.color === col.hex ? '3px solid #4f46e5' : '1px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                  title={col.name}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => setIsNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={actionLoading}>
              Save Note
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StudentPlanner;
