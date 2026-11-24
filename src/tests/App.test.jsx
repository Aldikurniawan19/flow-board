import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.jsx';
import { useBoardStore } from '../store/useBoardStore.js';
import { apiClient } from '../store/apiClient.js';

describe('FlowBoard UI integration', () => {
  beforeEach(() => {
    useBoardStore.setState({
      user: null,
      authStatus: 'loading',
      authError: '',
      boards: [],
      activeBoardId: null,
      boardTitle: 'Papan Kerja Pertama',
      boardLoadState: 'idle',
      boardLoadError: '',
      saveStatus: 'saved',
      feedback: null,
      elements: [],
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Auth screen when unauthenticated and surfaces login error cleanly', async () => {
    vi.spyOn(apiClient, 'getMe').mockRejectedValue(new Error('Unauthorized'));
    vi.spyOn(apiClient, 'login').mockRejectedValue(new Error('Email atau kata sandi salah.'));

    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'FlowBoard' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Alamat Email'), 'test@example.com');
    const pwdInput = screen.getByLabelText('Kata Sandi');
    expect(pwdInput).toHaveAttribute('type', 'password');
    await user.type(pwdInput, 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Lihat kata sandi' }));
    expect(pwdInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Sembunyikan kata sandi' }));
    expect(pwdInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Masuk ke FlowBoard' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email atau kata sandi salah.');
  });

  it('renders workspace, searches DFD/ERD shapes, and applies starter template from empty state', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      user: { id: 'u1', name: 'Rina', email: 'rina@example.com' },
    });
    vi.spyOn(apiClient, 'listBoards').mockResolvedValue({
      boards: [{ id: 'b1', title: 'Perancangan Sistem', createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(apiClient, 'getBoard').mockResolvedValue({
      board: {
        id: 'b1',
        title: 'Perancangan Sistem',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true },
        elements: [],
      },
    });
    vi.spyOn(apiClient, 'updateBoard').mockResolvedValue({
      board: { id: 'b1', title: 'ERD Relasional', updatedAt: '' },
    });

    const user = userEvent.setup();
    render(<App />);

    // Empty state appears for empty board
    expect(await screen.findByText('Papan kerja masih kosong')).toBeInTheDocument();

    // Default End Marker picker renders visual SVG previews and updates defaultEndMarker
    await user.click(screen.getByLabelText('Ujung Akhir Default'));
    const crowOption = screen.getByRole('option', { name: 'Nol atau Banyak (O<)' });
    expect(crowOption.querySelector('svg')).not.toBeNull();
    await user.click(crowOption);
    expect(useBoardStore.getState().defaultEndMarker).toBe('crow_zero_many');

    // Top toolbar displays shortcut initials alongside tool icons
    expect(screen.getByRole('button', { name: 'Pilih (V)' })).toHaveTextContent('V');
    expect(screen.getByRole('button', { name: 'Pena Bebas (P)' })).toHaveTextContent('P');
    expect(screen.getByRole('button', { name: 'Konektor / Panah (C)' })).toHaveTextContent('C');

    // Search shape library for ERD table
    const searchInput = screen.getByLabelText(/Cari bentuk DFD, ERD, UML/i);
    await user.type(searchInput, 'Tabel Entitas ERD');
    expect(screen.getByText('Tabel Entitas ERD')).toBeInTheDocument();

    // Apply ERD starter template from empty overlay
    const erdButtons = screen.getAllByRole('button', { name: /ERD Relasional/i });
    await user.click(erdButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Papan kerja masih kosong')).not.toBeInTheDocument();
      expect(useBoardStore.getState().elements.length).toBeGreaterThan(0);
    });

    // Ctrl+Wheel zooms canvas without triggering native browser zoom
    const wheelIn = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(wheelIn);
    });
    expect(wheelIn.defaultPrevented).toBe(true);
    expect(useBoardStore.getState().camera.zoom).toBeGreaterThan(1);

    // Ctrl+0 resets canvas zoom back to 100%, Ctrl+- zooms out
    const resetEvent = new KeyboardEvent('keydown', {
      key: '0',
      code: 'Digit0',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(resetEvent);
    });
    expect(resetEvent.defaultPrevented).toBe(true);
    expect(useBoardStore.getState().camera.zoom).toBeCloseTo(1, 5);

    const zoomOutEvent = new KeyboardEvent('keydown', {
      key: '-',
      code: 'Minus',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(zoomOutEvent);
    });
    expect(zoomOutEvent.defaultPrevented).toBe(true);
    expect(useBoardStore.getState().camera.zoom).toBeLessThan(1);

    // '[' toggles left Shape Library panel, ']' toggles right Board Settings / Inspector panel
    expect(screen.getByLabelText('Pustaka bentuk diagram')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true }));
    });
    expect(screen.queryByLabelText('Pustaka bentuk diagram')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true }));
    });
    expect(screen.getByLabelText('Pustaka bentuk diagram')).toBeInTheDocument();

    expect(screen.getByLabelText('Panel properti elemen')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true }));
    });
    expect(screen.queryByLabelText('Panel properti elemen')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true }));
    });
    expect(screen.getByLabelText('Panel properti elemen')).toBeInTheDocument();

    // Select All (Ctrl+A) enables bulk editing of shapes, connectors, typography, and render style
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    const total = useBoardStore.getState().elements.length;
    expect(useBoardStore.getState().selectedIds).toHaveLength(total);
    expect(screen.getByText(`${total} Elemen Dipilih`)).toBeInTheDocument();

    // Switch render style to Sketch across all selected shapes, connectors, and text
    await user.click(screen.getByRole('button', { name: 'Sketsa Tangan' }));
    const afterSketch = useBoardStore.getState().elements;
    expect(afterSketch.every((el) => el.roughness > 0 && el.fontFamily === 'sketch')).toBe(true);

    // Change typography size across all selected text-capable elements
    await user.click(screen.getByRole('button', { name: '18' }));
    expect(useBoardStore.getState().elements.every((el) => el.fontSize === 18)).toBe(true);

    // Change connector routing in multi-select only updates connectors without corrupting shapes
    await user.click(screen.getByRole('button', { name: 'Kurva' }));
    const connectors = useBoardStore.getState().elements.filter((el) => el.type === 'connector');
    const shapes = useBoardStore.getState().elements.filter((el) => el.type !== 'connector');
    expect(connectors.length).toBeGreaterThan(0);
    expect(connectors.every((c) => c.routing === 'curved')).toBe(true);
    expect(shapes.every((s) => s.routing === undefined)).toBe(true);

    // Fill color in multi-select only updates fillable shapes, leaving connectors transparent
    await user.click(screen.getByRole('button', { name: 'Warna isi Biru Lembut' }));
    const updatedConnectors = useBoardStore.getState().elements.filter((el) => el.type === 'connector');
    const updatedShapes = useBoardStore.getState().elements.filter((el) => el.type !== 'connector');
    expect(updatedShapes.every((s) => s.fillColor === '#DBEAFE')).toBe(true);
    expect(updatedConnectors.every((c) => c.fillColor === 'transparent')).toBe(true);

    // Arrow keys nudge selected unlocked elements (2px normal, 20px with Shift)
    const firstShape = updatedShapes[0];
    const startX = firstShape.x;
    const startY = firstShape.y;
    act(() => {
      useBoardStore.getState().setSelectedIds([firstShape.id]);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }),
      );
    });
    const movedShape = useBoardStore.getState().elements.find((el) => el.id === firstShape.id);
    expect(movedShape?.x).toBe(startX + 2);
    expect(movedShape?.y).toBe(startY + 20);

    // Open PlantText modal, pick DFD example, and generate native DFD diagram onto canvas
    await user.click(screen.getByRole('button', { name: /PlantText/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'DFD' }));
    expect(screen.getByText(/Terdeteksi:/i)).toHaveTextContent('DFD (Gane & Sarson)');
    await user.click(screen.getByRole('button', { name: /Generate ke Kanvas/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useBoardStore.getState().elements.some((el) => el.type === 'dfd_gs_process')).toBe(true);
      expect(useBoardStore.getState().elements.some((el) => el.type === 'dfd_gs_datastore')).toBe(true);
    });

    // Ctrl+S prevents native Save Page, saves board, and opens Export / Download dialog
    const saveKeyEvent = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(saveKeyEvent);
    });
    expect(saveKeyEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Ekspor & Impor Diagram/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tutup dialog' }));

    // Right-clicking a selected component opens the shape-switcher context menu and morphs its shape
    const targetNode = useBoardStore.getState().elements.find((el) => el.type === 'dfd_gs_process');
    expect(targetNode).toBeDefined();
    if (targetNode) {
      act(() => {
        useBoardStore.getState().setSelectedIds([targetNode.id]);
        useBoardStore.getState().setCamera({ x: 0, y: 0, zoom: 1 });
      });
      const canvas = screen.getByLabelText('Kanvas papan tulis FlowBoard');
      const cx = targetNode.x + targetNode.width / 2;
      const cy = targetNode.y + targetNode.height / 2;
      act(() => {
        canvas.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            button: 2,
          }),
        );
      });
      expect(screen.getByRole('menu', { name: 'Ganti bentuk komponen' })).toBeInTheDocument();
      await user.click(screen.getByRole('menuitem', { name: 'Proses DFD (Yourdon)' }));
      const morphed = useBoardStore.getState().elements.find((el) => el.id === targetNode.id);
      expect(morphed?.type).toBe('dfd_yd_process');
      expect(morphed?.text).toBe(targetNode.text);
      expect(screen.queryByRole('menu', { name: 'Ganti bentuk komponen' })).not.toBeInTheDocument();
    }
  }, 15000);
});
