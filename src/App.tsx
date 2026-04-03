import { useState, useEffect, useCallback } from "react";
import "./App.css";

interface Todo {
  id: string;
  title: string;
  completed: number;
  created_at: string;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch("/api/todos");
      if (!res.ok) throw new Error("Failed to load tasks");
      const data: Todo[] = await res.json();
      setTodos(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to add task");
      const created: Todo = await res.json();
      setTodos((prev) => [created, ...prev]);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function toggleTodo(todo: Todo) {
    const before = todos;
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id ? { ...t, completed: t.completed ? 0 : 1 } : t
      )
    );
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !todo.completed }),
      });
      if (!res.ok) throw new Error("Failed to update task");
    } catch {
      setTodos(before);
    }
  }

  async function deleteTodo(id: string) {
    const before = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");
    } catch {
      setTodos(before);
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditText(todo.title);
  }

  async function saveEdit(todo: Todo) {
    const title = editText.trim();
    setEditingId(null);
    if (!title || title === todo.title) return;
    const before = todos;
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, title } : t))
    );
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to update task");
    } catch {
      setTodos(before);
    }
  }

  const pending = todos.filter((t) => !t.completed);
  const done = todos.filter((t) => t.completed);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-icon">✓</div>
        <h1>My To-Do List</h1>
        <p className="header-sub">Powered by Cloudflare Workers + D1</p>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <form className="add-form" onSubmit={addTodo}>
          <input
            type="text"
            className="add-input"
            placeholder="Add a new task..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={adding}
            autoFocus
          />
          <button
            type="submit"
            className="add-btn"
            disabled={adding || !newTitle.trim()}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>

        {loading ? (
          <div className="loading">Loading your tasks…</div>
        ) : (
          <>
            {todos.length === 0 && (
              <div className="empty">No tasks yet. Add one above!</div>
            )}

            {pending.length > 0 && (
              <section>
                <h2 className="section-title">To Do ({pending.length})</h2>
                <ul className="todo-list">
                  {pending.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      editingId={editingId}
                      editText={editText}
                      onEditText={setEditText}
                      onToggle={toggleTodo}
                      onDelete={deleteTodo}
                      onStartEdit={startEdit}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </ul>
              </section>
            )}

            {done.length > 0 && (
              <section>
                <h2 className="section-title done-title">
                  Completed ({done.length})
                </h2>
                <ul className="todo-list">
                  {done.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      editingId={editingId}
                      editText={editText}
                      onEditText={setEditText}
                      onToggle={toggleTodo}
                      onDelete={deleteTodo}
                      onStartEdit={startEdit}
                      onSaveEdit={saveEdit}
                      onCancelEdit={() => setEditingId(null)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface TodoItemProps {
  todo: Todo;
  editingId: string | null;
  editText: string;
  onEditText: (v: string) => void;
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  onStartEdit: (t: Todo) => void;
  onSaveEdit: (t: Todo) => void;
  onCancelEdit: () => void;
}

function TodoItem({
  todo,
  editingId,
  editText,
  onEditText,
  onToggle,
  onDelete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: TodoItemProps) {
  const isEditing = editingId === todo.id;
  const isCompleted = Boolean(todo.completed);

  return (
    <li className={`todo-item${isCompleted ? " completed" : ""}`}>
      <button
        className={`check-btn${isCompleted ? " checked" : ""}`}
        onClick={() => onToggle(todo)}
        aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {isCompleted && "✓"}
      </button>

      {isEditing ? (
        <input
          className="edit-input"
          value={editText}
          autoFocus
          onChange={(e) => onEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit(todo);
            if (e.key === "Escape") onCancelEdit();
          }}
          onBlur={() => onSaveEdit(todo)}
        />
      ) : (
        <span
          className="todo-title"
          onDoubleClick={() => !isCompleted && onStartEdit(todo)}
          title={isCompleted ? "" : "Double-click to edit"}
        >
          {todo.title}
        </span>
      )}

      <div className="item-actions">
        {!isCompleted && !isEditing && (
          <button
            className="edit-btn"
            onClick={() => onStartEdit(todo)}
            aria-label="Edit"
          >
            ✎
          </button>
        )}
        <button
          className="delete-btn"
          onClick={() => onDelete(todo.id)}
          aria-label="Delete"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export default App;
