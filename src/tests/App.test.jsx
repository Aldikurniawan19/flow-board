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
      selectedIds: [],
      editingId: null,
      past: [],
      future: [],
      copiedSize: null,
      theme: 'light',
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
    expect(screen.getByText(/Aldi Kurniawan/i)).toBeInTheDocument();

    // Theme toggle works on the auth screen and persists preference
    await user.click(screen.getByRole('button', { name: 'Aktifkan tema gelap' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('flowboard-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Aktifkan tema terang' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('flowboard-theme')).toBe('light');

    // Switching between Login and Register tabs works cleanly
    await user.click(screen.getByRole('tab', { name: 'Daftar Akun' }));
    expect(screen.getByLabelText('Nama Lengkap')).toBeInTheDocument();
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
  }, 25000);
});
