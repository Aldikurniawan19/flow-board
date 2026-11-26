import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.jsx';
import { useBoardStore } from '../store/useBoardStore.js';
import { apiClient } from '../store/apiClient.js';

describe('FlowBoard UI integration', () => {
  beforeEach(() => {
    window.localStorage.removeItem('flowboard-theme');
    document.documentElement.classList.remove('dark');
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
      activeTool: 'select',
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
      copiedSize: null,
      theme: 'light',
      guestPreviewMode: false,
      aiUpgradeRequested: false,
      pendingBoardId: null,
      pendingDeepLink: null,
      pendingDiagram: null,
    });
    window.history.replaceState({}, '', '/');
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
    expect(screen.getByText(/Aldi Kurniawan/i)).toBeInTheDocument();

    // Theme toggle works on the auth screen and persists preference
    await user.click(screen.getByRole('button', { name: 'Aktifkan tema gelap' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('flowboard-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Aktifkan tema terang' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('flowboard-theme')).toBe('light');

    // Switching between Login and Register tabs works cleanly (including Google OAuth CTA label)
    const googleLink = screen.getByRole('link', { name: 'Masuk dengan Google' });
    expect(googleLink).toHaveAttribute('href', '/api/auth/google?returnTo=%2F');
    await user.click(screen.getByRole('tab', { name: 'Daftar Akun' }));
    expect(screen.getByLabelText('Nama Lengkap')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Daftar dengan Google' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Masuk' }));
    expect(screen.queryByLabelText('Nama Lengkap')).not.toBeInTheDocument();

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

    // Open unified Menu (via hover/click), verify both PlantText & Export/Import items exist, and open PlantText modal
    await user.click(screen.getByRole('button', { name: /Menu PlantText dan Ekspor Impor/i }));
    expect(screen.getByRole('menuitem', { name: /Ekspor \/ Impor/i })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /PlantText/i }));
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

    // Manual size editing, aspect ratio lock, copy/paste size, and multi-select equalize
    const resizableNodes = useBoardStore
      .getState()
      .elements.filter((el) => el.type !== 'connector' && el.type !== 'freehand');
    expect(resizableNodes.length).toBeGreaterThanOrEqual(3);
    const [nodeA, nodeB, nodeC] = resizableNodes;

    act(() => {
      useBoardStore.getState().setSelectedIds([nodeA.id]);
    });

    const widthInput = screen.getByLabelText('Lebar komponen dalam piksel');
    const heightInput = screen.getByLabelText('Tinggi komponen dalam piksel');
    await user.clear(widthInput);
    await user.type(widthInput, '200');
    await user.clear(heightInput);
    await user.type(heightInput, '100');

    let updatedA = useBoardStore.getState().elements.find((el) => el.id === nodeA.id);
    expect(updatedA?.width).toBe(200);
    expect(updatedA?.height).toBe(100);

    // Lock aspect ratio (2:1) and resize width to 240 -> height scales to 120
    await user.click(screen.getByRole('button', { name: 'Kunci rasio aspek' }));
    await user.clear(widthInput);
    await user.type(widthInput, '240');
    updatedA = useBoardStore.getState().elements.find((el) => el.id === nodeA.id);
    expect(updatedA?.width).toBe(240);
    expect(updatedA?.height).toBe(120);

    // Copy size from nodeA and paste onto nodeB without duplicating
    await user.click(screen.getByRole('button', { name: 'Salin Ukuran' }));
    act(() => {
      useBoardStore.getState().setSelectedIds([nodeB.id]);
    });
    await user.click(screen.getByRole('button', { name: /Tempel \(240×120\)/i }));
    const updatedB = useBoardStore.getState().elements.find((el) => el.id === nodeB.id);
    expect(updatedB?.width).toBe(240);
    expect(updatedB?.height).toBe(120);

    // Multi-select via Ctrl+Click toggles components into and out of selection
    const canvasEl = screen.getByLabelText('Kanvas papan tulis FlowBoard');
    canvasEl.setPointerCapture = vi.fn();
    canvasEl.releasePointerCapture = vi.fn();
    canvasEl.hasPointerCapture = vi.fn(() => false);
    act(() => {
      useBoardStore.getState().setSelectedIds([nodeA.id]);
      useBoardStore.getState().setCamera({ x: 0, y: 0, zoom: 1 });
    });
    const nodeCCenterX = nodeC.x + nodeC.width / 2;
    const nodeCCenterY = nodeC.y + nodeC.height / 2;
    act(() => {
      canvasEl.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: nodeCCenterX,
          clientY: nodeCCenterY,
          ctrlKey: true,
          button: 0,
        }),
      );
      canvasEl.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: nodeCCenterX,
          clientY: nodeCCenterY,
          ctrlKey: true,
          button: 0,
        }),
      );
    });
    expect(useBoardStore.getState().selectedIds).toEqual([nodeA.id, nodeC.id]);

    // Equalize both width & height of the Ctrl+Click multi-selected components in 1 click
    await user.click(screen.getByRole('button', { name: 'Samakan L & T' }));
    const updatedC = useBoardStore.getState().elements.find((el) => el.id === nodeC.id);
    expect(updatedC?.width).toBe(240);
    expect(updatedC?.height).toBe(120);

    // Ctrl+Click again on nodeC removes it from the selection while keeping nodeA selected
    const updatedCCenterX = (updatedC?.x ?? nodeC.x) + (updatedC?.width ?? nodeC.width) / 2;
    const updatedCCenterY = (updatedC?.y ?? nodeC.y) + (updatedC?.height ?? nodeC.height) / 2;
    act(() => {
      canvasEl.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: updatedCCenterX,
          clientY: updatedCCenterY,
          ctrlKey: true,
          button: 0,
        }),
      );
    });
    expect(useBoardStore.getState().selectedIds).toEqual([nodeA.id]);

    // Tab / Shift+Tab switches between boards when multiple boards exist
    const getBoardSpy = vi.spyOn(apiClient, 'getBoard').mockImplementation(async (id) => ({
      board: {
        id,
        title: id === 'b2' ? 'DFD Level 1' : 'Perancangan Sistem',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true },
        elements: [],
      },
    }));
    act(() => {
      useBoardStore.setState({
        boards: [
          { id: 'b1', title: 'Perancangan Sistem', createdAt: '', updatedAt: '' },
          { id: 'b2', title: 'DFD Level 1', createdAt: '', updatedAt: '' },
        ],
        activeBoardId: 'b1',
        saveStatus: 'saved',
      });
    });
    expect(screen.getByText('Papan 1/2')).toBeInTheDocument();
    const tabNext = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(tabNext);
    });
    expect(tabNext.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(useBoardStore.getState().activeBoardId).toBe('b2');
      expect(useBoardStore.getState().boardTitle).toBe('DFD Level 1');
      expect(screen.getByText('Papan 2/2')).toBeInTheDocument();
    });

    const tabPrev = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(tabPrev);
    });
    expect(tabPrev.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(useBoardStore.getState().activeBoardId).toBe('b1');
      expect(useBoardStore.getState().boardTitle).toBe('Perancangan Sistem');
      expect(screen.getByText('Papan 1/2')).toBeInTheDocument();
    });
    expect(getBoardSpy).toHaveBeenCalledWith('b2');
    expect(getBoardSpy).toHaveBeenCalledWith('b1');

    // Pressing 'n' creates a new board and selects it
    const createBoardSpy = vi.spyOn(apiClient, 'createBoard').mockResolvedValue({
      board: {
        id: 'b3',
        title: 'Papan Baru 3',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true },
        elements: [],
        createdAt: '',
        updatedAt: '',
      },
    });
    const newBoardKey = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(newBoardKey);
    });
    expect(newBoardKey.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(createBoardSpy).toHaveBeenCalled();
      expect(useBoardStore.getState().activeBoardId).toBe('b3');
      expect(screen.getByText('Papan 1/3')).toBeInTheDocument();
    });

    // Clicking "Mulai Coret Bebas" activates the pen tool and hides the empty canvas modal
    expect(screen.getByText('Papan kerja masih kosong')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mulai Coret Bebas' }));
    expect(useBoardStore.getState().activeTool).toBe('pen');
    expect(screen.queryByText('Papan kerja masih kosong')).not.toBeInTheDocument();

    // Per-board delete button opens confirmation modal; cancel keeps board, confirm deletes it
    const deleteBoardSpy = vi.spyOn(apiClient, 'deleteBoard').mockResolvedValue({ ok: true });
    await user.click(screen.getByRole('button', { name: /Papan 1\/3/i }));
    await user.click(screen.getByRole('button', { name: 'Hapus papan DFD Level 1' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Hapus Papan Kerja\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteBoardSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Papan 1\/3/i }));
    await user.click(screen.getByRole('button', { name: 'Hapus papan DFD Level 1' }));
    await user.click(screen.getByRole('button', { name: 'Ya, Hapus' }));
    await waitFor(() => {
      expect(deleteBoardSpy).toHaveBeenCalledWith('b2');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Papan 1/2')).toBeInTheDocument();
    });

    // Bulk board delete: add a 3rd board, select 2 boards via checkboxes, and delete both in one click
    act(() => {
      useBoardStore.setState({
        boards: [
          { id: 'b3', title: 'Papan Baru 3', createdAt: '', updatedAt: '' },
          { id: 'b4', title: 'Papan Dummy A', createdAt: '', updatedAt: '' },
          { id: 'b1', title: 'Perancangan Sistem', createdAt: '', updatedAt: '' },
        ],
        activeBoardId: 'b3',
      });
    });
    deleteBoardSpy.mockClear();
    await user.click(screen.getByRole('button', { name: /Papan 1\/3/i }));
    expect(screen.queryByRole('button', { name: 'Pilih Semua' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Pilih papan Papan Dummy A' }));
    expect(screen.getByRole('button', { name: 'Pilih Semua' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pilih Semua' }));
    // Last remaining board checkbox is automatically disabled to preserve at least 1 active board
    expect(screen.getByRole('checkbox', { name: 'Pilih papan Papan Baru 3' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Hapus (2)' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hapus 2 Papan Kerja?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ya, Hapus (2)' }));
    await waitFor(() => {
      expect(deleteBoardSpy).toHaveBeenCalledWith('b4');
      expect(deleteBoardSpy).toHaveBeenCalledWith('b1');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Papan 1/1')).toBeInTheDocument();
    });
    // Sync same-type is ON by default: changing fill/size on one component updates same-type siblings,
    // and toggling it OFF isolates edits to only the selected component
    const sameTypePair = [
      {
        id: 'sync-p1',
        type: 'dfd_gs_process',
        x: 40,
        y: 40,
        width: 160,
        height: 96,
        strokeColor: '#0F172A',
        fillColor: '#DBEAFE',
        strokeWidth: 2,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: 0,
        opacity: 1,
        seed: 11,
        text: 'Proses A',
        code: '1.0',
        fontSize: 14,
        fontFamily: /** @type {const} */ ('sans'),
      },
      {
        id: 'sync-p2',
        type: 'dfd_gs_process',
        x: 300,
        y: 40,
        width: 160,
        height: 96,
        strokeColor: '#0F172A',
        fillColor: '#DBEAFE',
        strokeWidth: 2,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: 0,
        opacity: 1,
        seed: 12,
        text: 'Proses B',
        code: '2.0',
        fontSize: 14,
        fontFamily: /** @type {const} */ ('sans'),
      },
      {
        id: 'sync-e1',
        type: 'dfd_gs_entity',
        x: 40,
        y: 220,
        width: 140,
        height: 70,
        strokeColor: '#0F172A',
        fillColor: '#FFFFFF',
        strokeWidth: 2,
        strokeStyle: /** @type {const} */ ('solid'),
        roughness: 0,
        opacity: 1,
        seed: 13,
        text: 'Pelanggan',
        fontSize: 14,
        fontFamily: /** @type {const} */ ('sans'),
      },
    ];
    act(() => {
      useBoardStore.setState({
        elements: sameTypePair,
        selectedIds: ['sync-p1'],
      });
    });

    // Default ON: changing fill color on sync-p1 also updates sync-p2, leaving sync-e1 untouched
    const syncSwitch = screen.getByRole('switch', { name: 'Sinkron perubahan ke komponen sejenis' });
    expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Warna isi Hijau Lembut' }));
    let syncedEls = useBoardStore.getState().elements;
    expect(syncedEls.find((e) => e.id === 'sync-p1')?.fillColor).toBe('#DCFCE7');
    expect(syncedEls.find((e) => e.id === 'sync-p2')?.fillColor).toBe('#DCFCE7');
    expect(syncedEls.find((e) => e.id === 'sync-e1')?.fillColor).toBe('#FFFFFF');

    // Toggle OFF: changing fill color on sync-p1 only updates sync-p1
    await user.click(syncSwitch);
    expect(syncSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: 'Warna isi Amber Lembut' }));
    syncedEls = useBoardStore.getState().elements;
    expect(syncedEls.find((e) => e.id === 'sync-p1')?.fillColor).toBe('#FEF3C7');
    expect(syncedEls.find((e) => e.id === 'sync-p2')?.fillColor).toBe('#DCFCE7');

    // Free user clicking Integrasi AI & MCP sees interactive 2-scene motion demo + Pro pitch -> pricing -> WhatsApp Admin CTA
    await user.click(screen.getByRole('button', { name: /Menu PlantText dan Ekspor Impor/i }));
    await user.click(screen.getByRole('menuitem', { name: /Integrasi AI & MCP/i }));
    expect(screen.getByRole('heading', { name: /Integrasi AI & MCP — FlowBoard Pro/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1. Koneksi MCP' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '2. Tautan AI' }));
    expect(screen.getByText(/Buka Diagram di FlowBoard/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Jeda animasi demo' }));
    expect(screen.getByRole('button', { name: 'Putar animasi demo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Berlangganan Pro' }));
    expect(screen.getByRole('heading', { name: 'Pilih Paket FlowBoard Pro' })).toBeInTheDocument();
    expect(screen.getByText('Rp 50.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 35.000')).toBeInTheDocument();
    expect(screen.getByText('Rp 249.000')).toBeInTheDocument();
    const waLink = screen.getByRole('link', { name: 'Hubungi Admin via WhatsApp' });
    expect(waLink.getAttribute('href')).toContain('https://wa.me/');
    expect(waLink.getAttribute('href')).toContain(encodeURIComponent('rina@example.com'));
    await user.click(screen.getByRole('button', { name: 'Tutup dialog integrasi AI' }));

    // Owner / Pro user gets full MCP Server & API Key manager
    act(() => {
      useBoardStore.setState({
        user: {
          id: 'u1',
          name: 'Rina',
          email: 'rina@example.com',
          plan: 'pro',
          isOwner: true,
          hasAiAccess: true,
        },
      });
    });
    vi.spyOn(apiClient, 'listApiKeys').mockResolvedValue({ keys: [] });
    vi.spyOn(apiClient, 'listOAuthConnections').mockResolvedValue({
      connections: [
        {
          id: 'conn-1',
          clientId: 'fb_cli_claude',
          clientName: 'Claude.ai Web',
          scope: 'mcp:tools',
          createdAt: '2026-11-26T00:00:00.000Z',
          lastUsedAt: null,
        },
      ],
    });
    vi.spyOn(apiClient, 'revokeOAuthConnection').mockResolvedValue({ ok: true });
    vi.spyOn(apiClient, 'createApiKey').mockResolvedValue({
      apiKey: {
        id: 'key-1',
        name: 'Claude Desktop',
        keyPrefix: 'fbk_12345678',
        createdAt: '2026-11-25T00:00:00.000Z',
        lastUsedAt: null,
      },
      secret: 'fbk_1234567890abcdef1234567890abcdef1234567890abcdef',
    });
    vi.spyOn(apiClient, 'deleteApiKey').mockResolvedValue({ ok: true });

    await user.click(screen.getByRole('button', { name: /Menu PlantText dan Ekspor Impor/i }));
    await user.click(screen.getByRole('menuitem', { name: /Integrasi AI & MCP/i }));
    expect(screen.getByRole('heading', { name: 'Integrasi AI & MCP Server' })).toBeInTheDocument();
    expect(await screen.findByText('Claude.ai Web')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cabut koneksi OAuth Claude.ai Web' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cabut koneksi OAuth Claude.ai Web' })).not.toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Nama API Key'), 'Claude Desktop');
    await user.click(screen.getByRole('button', { name: 'Buat Key' }));
    expect(
      await screen.findByText('fbk_1234567890abcdef1234567890abcdef1234567890abcdef'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cabut API Key Claude Desktop' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cabut API Key Claude Desktop' })).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: /Prompt & Tautan AI/i }));
    expect(screen.getByRole('button', { name: 'Salin URL llms.txt' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tutup dialog integrasi AI' }));
  }, 45000);

  it('locks AI deep-link URLs to Pro/Owner accounts while blocking guests and free users', async () => {
    const plantCode = `@startuml
entity "PELANGGAN" as p {
  * id_pelanggan <<PK>>
  --
  * nama
}
entity "TRANSAKSI" as t {
  * id_transaksi <<PK>>
  --
  * total
}
p "1" -- "N" t : "MELAKUKAN"
@enduml`;

    // 1. Unauthenticated visitor sees Auth screen (deep-link does NOT bypass login)
    vi.spyOn(apiClient, 'getMe').mockRejectedValueOnce(new Error('Unauthorized'));
    const qs1 = new URLSearchParams({ kind: 'erd_chen', title: 'ERD Rental AI', code: plantCode });
    window.history.replaceState({}, '', `/?${qs1.toString()}`);

    const firstRender = render(<App />);
    expect(await screen.findByRole('heading', { name: 'FlowBoard' })).toBeInTheDocument();
    expect(useBoardStore.getState().guestPreviewMode).toBe(false);
    expect(useBoardStore.getState().elements).toHaveLength(0);
    firstRender.unmount();

    // 2. Authenticated Free user does NOT import diagram and gets Pro upgrade modal instead
    vi.spyOn(apiClient, 'getMe').mockResolvedValueOnce({
      user: { id: 'u-free', name: 'Free', email: 'free@example.com', plan: 'free', isOwner: false, hasAiAccess: false },
    });
    vi.spyOn(apiClient, 'listBoards').mockResolvedValue({
      boards: [{ id: 'bf1', title: 'Papan Gratis', createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(apiClient, 'getBoard').mockResolvedValue({
      board: { id: 'bf1', title: 'Papan Gratis', settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true }, elements: [] },
    });
    window.history.replaceState({}, '', `/?${qs1.toString()}`);

    const freeRender = render(<App />);
    expect(
      await screen.findByRole('heading', { name: /Integrasi AI & MCP — FlowBoard Pro/i }),
    ).toBeInTheDocument();
    expect(useBoardStore.getState().elements).toHaveLength(0);
    freeRender.unmount();

    // 3. Authenticated Owner/Pro user automatically imports the AI deep-link into a new board
    vi.spyOn(apiClient, 'getMe').mockResolvedValueOnce({
      user: { id: 'u-own', name: 'Owner', email: 'owner@example.com', plan: 'pro', isOwner: true, hasAiAccess: true },
    });
    vi.spyOn(apiClient, 'createBoard').mockResolvedValueOnce({
      board: {
        id: 'b-ai',
        title: 'ERD Rental AI',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true, autoCorrectShapes: true, syncSameType: true },
        elements: [],
        createdAt: '',
        updatedAt: '',
      },
    });
    window.history.replaceState({}, '', `/?${qs1.toString()}`);

    render(<App />);
    await waitFor(() => {
      expect(useBoardStore.getState().boardTitle).toBe('ERD Rental AI');
      expect(apiClient.createBoard).toHaveBeenCalled();
    });
  });

  it('renders OAuth 2.1 login prompt and consent screen on /oauth/authorize for Pro/Owner vs Free users', async () => {
    const oauthQuery =
      '?client_id=fb_cli_test&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&response_type=code&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=abc';
    window.history.replaceState({}, '', `/oauth/authorize${oauthQuery}`);

    // 1. Unauthenticated visitor sees AuthScreen with OAuth notice banner and Google login preserving returnTo
    vi.spyOn(apiClient, 'getMe').mockRejectedValueOnce(new Error('Unauthorized'));
    const guestRender = render(<App />);
    expect(
      await screen.findByText(/melanjutkan otorisasi koneksi AI \(MCP OAuth 2\.1\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masuk dengan Google' }).getAttribute('href')).toContain(
      encodeURIComponent('/oauth/authorize'),
    );
    guestRender.unmount();

    // 2. Authenticated Free user sees Pro paywall on consent screen (cannot approve)
    vi.spyOn(apiClient, 'getMe').mockResolvedValueOnce({
      user: {
        id: 'u-free',
        name: 'Budi Free',
        email: 'free@example.com',
        plan: 'free',
        isOwner: false,
        hasAiAccess: false,
      },
    });
    vi.spyOn(apiClient, 'getOAuthAuthorizeInfo').mockResolvedValue({
      client: {
        clientId: 'fb_cli_test',
        clientName: 'Claude.ai Web',
        redirectUri: 'https://claude.ai/api/mcp/auth_callback',
        redirectHost: 'claude.ai',
      },
      scope: 'mcp:tools',
      resource: 'https://flow-board-dun.vercel.app/api/mcp',
      state: 'abc',
    });

    const freeRender = render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Hubungkan Claude.ai Web ke FlowBoard' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Koneksi MCP OAuth Khusus FlowBoard Pro/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Izinkan & Hubungkan' })).not.toBeInTheDocument();
    freeRender.unmount();

    // 3. Authenticated Owner/Pro user can approve OAuth consent
    vi.spyOn(apiClient, 'getMe').mockResolvedValueOnce({
      user: {
        id: 'u-own',
        name: 'Aldi Owner',
        email: 'owner@example.com',
        plan: 'pro',
        isOwner: true,
        hasAiAccess: true,
      },
    });
    const decisionSpy = vi
      .spyOn(apiClient, 'submitOAuthDecision')
      .mockResolvedValue({ redirectTo: '' });

    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Hubungkan Claude.ai Web ke FlowBoard' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Claude (Anthropic)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Izinkan & Hubungkan' }));
    await waitFor(() => {
      expect(decisionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'approve',
          client_id: 'fb_cli_test',
          code_challenge_method: 'S256',
          state: 'abc',
        }),
      );
    });
  });

  it('detects official Gemini, ChatGPT, and Claude brand icons from OAuth client metadata', async () => {
    const cases = [
      {
        clientName: 'Gemini Enterprise',
        redirectUri: 'https://gemini.google.com/oauth/callback',
        redirectHost: 'gemini.google.com',
        expectedLabel: 'Google Gemini',
      },
      {
        clientName: 'ChatGPT Connector',
        redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        redirectHost: 'chatgpt.com',
        expectedLabel: 'ChatGPT (OpenAI)',
      },
    ];

    for (const item of cases) {
      const qs = new URLSearchParams({
        client_id: 'fb_cli_brand',
        redirect_uri: item.redirectUri,
        response_type: 'code',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
        state: 'brand-test',
      });
      window.history.replaceState({}, '', `/oauth/authorize?${qs.toString()}`);

      vi.spyOn(apiClient, 'getMe').mockResolvedValueOnce({
        user: {
          id: 'u-own',
          name: 'Aldi Owner',
          email: 'owner@example.com',
          plan: 'pro',
          isOwner: true,
          hasAiAccess: true,
        },
      });
      vi.spyOn(apiClient, 'getOAuthAuthorizeInfo').mockResolvedValueOnce({
        client: {
          clientId: 'fb_cli_brand',
          clientName: item.clientName,
          redirectUri: item.redirectUri,
          redirectHost: item.redirectHost,
        },
        scope: 'mcp:tools',
        resource: 'https://flow-board-dun.vercel.app/api/mcp',
        state: 'brand-test',
      });

      const view = render(<App />);
      expect(await screen.findByRole('img', { name: item.expectedLabel })).toBeInTheDocument();
      view.unmount();
    }
  });

  it('allows dragging a generated connector label freely anywhere on canvas and resetting its position', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      user: { id: 'u1', name: 'Rina', email: 'rina@example.com' },
    });
    vi.spyOn(apiClient, 'listBoards').mockResolvedValue({
      boards: [{ id: 'b1', title: 'DFD KRS', createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(apiClient, 'getBoard').mockResolvedValue({
      board: {
        id: 'b1',
        title: 'DFD KRS',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true },
        elements: [
          {
            id: 'c-flow-1',
            type: 'connector',
            x: 100,
            y: 120,
            width: 240,
            height: 0,
            strokeColor: '#0F172A',
            fillColor: 'transparent',
            strokeWidth: 2,
            strokeStyle: 'solid',
            roughness: 0,
            opacity: 1,
            seed: 7,
            text: 'Pilihan mata kuliah',
            routing: 'straight',
            startMarker: 'none',
            endMarker: 'filled_arrow',
            labelPos: { x: 220, y: 120 },
          },
        ],
      },
    });
    vi.spyOn(apiClient, 'updateBoard').mockResolvedValue({
      board: { id: 'b1', title: 'DFD KRS', updatedAt: '' },
    });

    const user = userEvent.setup();
    render(<App />);

    const canvas = await screen.findByLabelText('Kanvas papan tulis FlowBoard');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => false);

    await waitFor(() => {
      expect(useBoardStore.getState().elements).toHaveLength(1);
    });

    act(() => {
      useBoardStore.getState().setCamera({ x: 0, y: 0, zoom: 1 });
      useBoardStore.getState().setSelectedIds([]);
    });

    // Grab the connector label directly at (220, 120) without selecting the connector first, then drag to (295, 210)
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 220,
          clientY: 120,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: 295,
          clientY: 210,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: 295,
          clientY: 210,
          button: 0,
        }),
      );
    });

    const movedConn = useBoardStore.getState().elements.find((el) => el.id === 'c-flow-1');
    expect(useBoardStore.getState().selectedIds).toEqual(['c-flow-1']);
    expect(movedConn?.labelPos).toEqual({ x: 295, y: 210 });

    // Clicking "Reset Posisi" in InspectorPanel restores automatic wire midpoint placement
    await user.click(screen.getByRole('button', { name: 'Reset Posisi' }));
    const resetConn = useBoardStore.getState().elements.find((el) => el.id === 'c-flow-1');
    expect(resetConn?.labelPos).toBeNull();
  });

  it('gates Rapikan Diagram Otomatis to Pro/Owner accounts and runs 2-mode tidy for Pro users', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Rina Free',
        email: 'rina@example.com',
        plan: 'free',
        isOwner: false,
        hasAiAccess: false,
      },
    });
    vi.spyOn(apiClient, 'listBoards').mockResolvedValue({
      boards: [{ id: 'b1', title: 'DFD KRS', createdAt: '', updatedAt: '' }],
    });
    const sampleElements = [
      {
        id: 'n1',
        type: 'dfd_gs_entity',
        x: 60,
        y: 80,
        width: 140,
        height: 70,
        strokeColor: '#0F172A',
        fillColor: '#FFFFFF',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 1,
        seed: 1,
        text: 'Mahasiswa',
      },
      {
        id: 'n2',
        type: 'dfd_gs_process',
        x: 340,
        y: 80,
        width: 160,
        height: 96,
        strokeColor: '#0F172A',
        fillColor: '#DBEAFE',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 1,
        seed: 2,
        text: 'Proses KRS',
      },
    ];
    vi.spyOn(apiClient, 'getBoard').mockResolvedValue({
      board: {
        id: 'b1',
        title: 'DFD KRS',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: true },
        elements: sampleElements,
      },
    });
    vi.spyOn(apiClient, 'updateBoard').mockResolvedValue({
      board: { id: 'b1', title: 'DFD KRS', updatedAt: '' },
    });

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => {
      expect(useBoardStore.getState().elements).toHaveLength(2);
    });

    // 1. Free user clicking "Rapikan Penuh" in the sidebar "Rapikan Tata Letak" section opens the Pro upgrade paywall
    const fullTidyBtn = screen.getByRole('button', { name: 'Rapikan Penuh' });
    expect(screen.getByRole('button', { name: 'Rapikan Garis & Label Saja' })).toBeInTheDocument();
    await user.click(fullTidyBtn);
    expect(
      await screen.findByRole('heading', { name: /Integrasi AI & MCP — FlowBoard Pro/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tutup dialog integrasi AI' }));

    // 2. Pro / Owner user runs "Rapikan Penuh" from the sidebar "Rapikan Tata Letak" section
    act(() => {
      useBoardStore.setState({
        user: {
          id: 'u1',
          name: 'Aldi Owner',
          email: 'owner@example.com',
          plan: 'pro',
          isOwner: true,
          hasAiAccess: true,
        },
      });
    });

    const tidySpy = vi.spyOn(apiClient, 'tidyDiagram').mockResolvedValue({
      elements: sampleElements.map((el) => ({ ...el, x: el.x + 20 })),
      metrics: {
        mode: 'full',
        before: { edgeCrossings: 2, nodeHits: 1, segmentOverlaps: 0, labelCollisions: 1 },
        after: { edgeCrossings: 0, nodeHits: 0, segmentOverlaps: 0, labelCollisions: 0 },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Rapikan Penuh' }));

    await waitFor(() => {
      expect(tidySpy).toHaveBeenCalledWith(sampleElements, 'full');
      expect(useBoardStore.getState().elements[0].x).toBe(80);
      expect(useBoardStore.getState().feedback?.message).toContain('Persilangan: 2 → 0');
    });
  });

  it('creates a bound connector by dragging from a shape midpoint quick-connect handle on hover or click', async () => {
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Aldi',
        email: 'aldi@example.com',
        plan: 'free',
        isOwner: false,
        hasAiAccess: false,
      },
    });
    vi.spyOn(apiClient, 'listBoards').mockResolvedValue({
      boards: [{ id: 'b1', title: 'Quick Connect Board', createdAt: '', updatedAt: '' }],
    });
    vi.spyOn(apiClient, 'getBoard').mockResolvedValue({
      board: {
        id: 'b1',
        title: 'Quick Connect Board',
        settings: { renderMode: 'clean', gridMode: 'dots', snapToGrid: false },
        elements: [
          {
            id: 'n1',
            type: 'rectangle',
            x: 100,
            y: 120,
            width: 120,
            height: 80,
            strokeColor: '#0F172A',
            fillColor: '#FFFFFF',
            strokeWidth: 2,
            strokeStyle: 'solid',
            roughness: 0,
            opacity: 1,
            seed: 1,
            text: 'Start',
          },
          {
            id: 'n2',
            type: 'rectangle',
            x: 360,
            y: 120,
            width: 120,
            height: 80,
            strokeColor: '#0F172A',
            fillColor: '#FFFFFF',
            strokeWidth: 2,
            strokeStyle: 'solid',
            roughness: 0,
            opacity: 1,
            seed: 2,
            text: 'End',
          },
        ],
      },
    });
    vi.spyOn(apiClient, 'updateBoard').mockResolvedValue({
      board: { id: 'b1', title: 'Quick Connect Board', updatedAt: '' },
    });

    const user = userEvent.setup();
    render(<App />);

    const canvas = await screen.findByLabelText('Kanvas papan tulis FlowBoard');
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => false);

    await waitFor(() => {
      expect(useBoardStore.getState().elements).toHaveLength(2);
    });

    act(() => {
      useBoardStore.getState().setCamera({ x: 0, y: 0, zoom: 1 });
      useBoardStore.getState().setSelectedIds([]);
      useBoardStore.getState().setActiveTool('select');
    });

    // 1. Hover over n1 (unselected), then hover its right quick-connect arrow (220 + 22 = 242, 160) -> translucent hover strip appears
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 160, clientY: 160 }),
      );
    });
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 242, clientY: 160 }),
      );
    });
    expect(canvas.style.cursor).toBe('crosshair');
    expect(screen.getByRole('menu', { name: 'Tambah simbol cepat' })).toBeInTheDocument();

    // Dragging directly from the right quick-connect arrow to n2 left port (360, 160) still draws a bound connector
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 242,
          clientY: 160,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: 360,
          clientY: 160,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: 360,
          clientY: 160,
          button: 0,
        }),
      );
    });

    const connectors = useBoardStore.getState().elements.filter((el) => el.type === 'connector');
    expect(connectors).toHaveLength(1);
    expect(connectors[0].startBinding?.elementId).toBe('n1');
    expect(connectors[0].startBinding?.side).toBe('right');
    expect(connectors[0].endBinding?.elementId).toBe('n2');
    expect(connectors[0].endBinding?.side).toBe('left');

    // 2. Selecting n1 and clicking (without dragging) its bottom quick-connect arrow (160, 222) opens the compact shape picker popover
    act(() => {
      useBoardStore.getState().setSelectedIds(['n1']);
    });
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 160,
          clientY: 222,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: 160,
          clientY: 222,
          button: 0,
        }),
      );
    });
    expect(useBoardStore.getState().elements.filter((el) => el.type === 'connector')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'Pilih simbol lanjutan' })).toBeInTheDocument();

    // 3. Clicking a common shape (Belah Ketupat) in the popover spawns it below n1 and auto-connects n1(bottom) -> newShape(top)
    await user.click(screen.getByRole('menuitem', { name: 'Tambah Belah Ketupat' }));
    const spawnedDiamond = useBoardStore.getState().elements.find((el) => el.type === 'diamond');
    expect(spawnedDiamond).toBeDefined();
    expect(spawnedDiamond?.y).toBeGreaterThan(200);
    const autoConn = useBoardStore
      .getState()
      .elements.find(
        (el) =>
          el.type === 'connector' &&
          el.startBinding?.elementId === 'n1' &&
          el.endBinding?.elementId === spawnedDiamond?.id,
      );
    expect(autoConn?.startBinding?.side).toBe('bottom');
    expect(autoConn?.endBinding?.side).toBe('top');

    // 4. Dragging the end handle of the n1 -> n2 connector to the extreme opposite (right) side of n2
    //    auto-reroutes around n2 with zero overlap and enters n2 from outside right (x > n2.x + n2.width)
    const firstConn = connectors[0];
    act(() => {
      useBoardStore.getState().setSelectedIds([firstConn.id]);
    });
    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: 360,
          clientY: 160,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: 480,
          clientY: 160,
          button: 0,
        }),
      );
      canvas.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          clientX: 480,
          clientY: 160,
          button: 0,
        }),
      );
    });
    const reroutedConn = useBoardStore.getState().elements.find((el) => el.id === firstConn.id);
    expect(reroutedConn?.endBinding?.elementId).toBe('n2');
    expect(reroutedConn?.endBinding?.side).toBe('right');
    expect((reroutedConn?.waypoints || []).some((pt) => pt.x > 480)).toBe(true);

    // 5. Rotating a single rectangle (via inspector or corner handle) rotates ONLY that component,
    //    never syncing to other same-type rectangles even when syncSameType is true
    act(() => {
      useBoardStore.getState().updateSettings({ syncSameType: true });
      useBoardStore.getState().setSelectedIds(['n1']);
    });
    await user.click(screen.getByRole('button', { name: '+45°' }));
    const n1AfterRot = useBoardStore.getState().elements.find((el) => el.id === 'n1');
    const n2AfterRot = useBoardStore.getState().elements.find((el) => el.id === 'n2');
    expect(n1AfterRot?.rotation).toBe(45);
    expect(n2AfterRot?.rotation || 0).toBe(0);

    // 6. Crossing line-jump ("Loncatan Garis Bersilang") toggle can be turned off and back on
    act(() => {
      useBoardStore.getState().setSelectedIds([]);
    });
    const jumpSwitch = screen.getByRole('switch', { name: 'Loncatan Garis Bersilang' });
    expect(jumpSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(jumpSwitch);
    expect(useBoardStore.getState().settings.lineJumps).toBe(false);
    expect(jumpSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(jumpSwitch);
    expect(useBoardStore.getState().settings.lineJumps).toBe(true);

    // 7. Pola Garis supports changing only the clicked connector ("Terpilih") OR all connectors at once ("Semua")
    const allConnsBefore = useBoardStore.getState().elements.filter((el) => el.type === 'connector');
    expect(allConnsBefore.length).toBeGreaterThanOrEqual(2);
    const [connOne, connTwo] = allConnsBefore;

    act(() => {
      useBoardStore.getState().setSelectedIds([connOne.id]);
    });
    // Default scope is "Terpilih" -> only connOne turns dashed, connTwo remains solid
    await user.click(screen.getByRole('button', { name: 'Putus' }));
    expect(useBoardStore.getState().elements.find((el) => el.id === connOne.id)?.strokeStyle).toBe(
      'dashed',
    );
    expect(useBoardStore.getState().elements.find((el) => el.id === connTwo.id)?.strokeStyle).toBe(
      'solid',
    );

    // Switching scope to "Semua" -> clicking "Titik" updates all connectors on the board at once
    await user.click(screen.getByRole('button', { name: 'Semua' }));
    await user.click(screen.getByRole('button', { name: 'Titik' }));
    expect(
      useBoardStore
        .getState()
        .elements.filter((el) => el.type === 'connector')
        .every((c) => c.strokeStyle === 'dotted'),
    ).toBe(true);

    // 8. Left sidebar "Garis & Penghubung" inserts ready-to-use connector presets directly onto the canvas
    const countBeforePreset = useBoardStore.getState().elements.length;
    await user.click(screen.getByRole('button', { name: /Relasi 1 : N \(ERD\)/i }));
    const afterPreset = useBoardStore.getState().elements;
    expect(afterPreset).toHaveLength(countBeforePreset + 1);
    const addedPreset = afterPreset[afterPreset.length - 1];
    expect(addedPreset.type).toBe('connector');
    expect(addedPreset.startMarker).toBe('crow_one_only');
    expect(addedPreset.endMarker).toBe('crow_zero_many');
  });
});
