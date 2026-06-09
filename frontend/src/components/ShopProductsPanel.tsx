import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import { api, ApiError } from '../api';
import { useConfirm } from '../contexts/ConfirmContext';
import type { ShopProduct } from '../api';
import { resolveUploadUrl } from '../utils/mediaUrl';
import { prepareProductImageFile, readProductImagePreview } from '../utils/productImageUpload';

type ShopProductsPanelProps = {
  shopProducts: ShopProduct[];
  loading: boolean;
  onRefresh: (opts?: { silent?: boolean }) => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
};

function ProductImageField({
  productId,
  imageUrl,
  onUploaded,
  showToast,
  compact,
}: {
  productId: string;
  imageUrl?: string | null;
  onUploaded: (opts?: { silent?: boolean }) => Promise<void>;
  showToast: (message: string, kind?: 'ok' | 'err') => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  /** Vista previa local inmediata (mientras sube o si el listado aún no trae imageUrl). */
  const [localPreview, setLocalPreview] = useState<string | undefined>();
  const resolvedImage =
    localPreview ?? resolveUploadUrl(imageUrl, imageVersion || undefined);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await prepareProductImageFile(file);
      setLocalPreview(dataUrl);
      const updated = await api.uploadShopProductImage(productId, dataUrl);
      if (updated.imageUrl) {
        setLocalPreview(resolveUploadUrl(updated.imageUrl, Date.now()));
      }
      setImageVersion(Date.now());
      showToast('Imagen guardada');
      await onUploaded({ silent: true });
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      setLocalPreview(undefined);
      showToast(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo subir la imagen', 'err');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={compact ? 'flex items-center gap-3' : 'space-y-2'}>
      <div
        className={`overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 ${
          compact ? 'h-14 w-14 shrink-0' : 'mx-auto h-32 w-32'
        }`}
      >
        {resolvedImage ? (
          <img src={resolvedImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <ImagePlus size={compact ? 20 : 32} aria-hidden />
          </div>
        )}
      </div>
      <div className={compact ? 'min-w-0 flex-1' : ''}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {uploading ? 'Subiendo…' : resolvedImage ? 'Cambiar foto' : 'Subir foto'}
        </button>
      </div>
    </div>
  );
}

/** Catálogo de productos de venta (nombre, precio, imagen, web). Los puntos se asignan en Puntos. */
export default function ShopProductsPanel({
  shopProducts,
  loading,
  onRefresh,
  showToast,
}: ShopProductsPanelProps) {
  const confirm = useConfirm();
  const [productName, setProductName] = useState('');
  const [productUnitPrice, setProductUnitPrice] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productWebActive, setProductWebActive] = useState(true);
  const [pendingImageData, setPendingImageData] = useState<string | null>(null);
  const [pendingImageLoading, setPendingImageLoading] = useState(false);
  const newImageRef = useRef<HTMLInputElement>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editWebActive, setEditWebActive] = useState(true);

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = productName.trim();
    if (!name) {
      showToast('Escribí el nombre del producto', 'err');
      return;
    }
    setSavingProduct(true);
    try {
      const up = productUnitPrice.trim();
      const created = await api.createShopProduct({
        name,
        pointsReward: 0,
        unitPrice: up ? up : undefined,
        description: productDescription.trim() || undefined,
        webActive: productWebActive,
      });
      if (pendingImageData) {
        await api.uploadShopProductImage(created.id, pendingImageData);
      }
      setProductName('');
      setProductUnitPrice('');
      setProductDescription('');
      setProductWebActive(true);
      setPendingImageData(null);
      showToast('Producto agregado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo crear el producto', 'err');
    } finally {
      setSavingProduct(false);
    }
  };

  const startEditProduct = (p: ShopProduct) => {
    setEditingProductId(p.id);
    setEditName(p.name);
    setEditUnitPrice(p.unitPrice ?? '');
    setEditDescription(p.description ?? '');
    setEditWebActive(p.webActive !== false);
  };

  const saveEditProduct = async (id: string) => {
    const name = editName.trim();
    if (!name) {
      showToast('El nombre no puede estar vacío', 'err');
      return;
    }
    try {
      const up = editUnitPrice.trim();
      await api.updateShopProduct(id, {
        name,
        unitPrice: up ? up : null,
        description: editDescription.trim() || null,
        webActive: editWebActive,
      });
      setEditingProductId(null);
      showToast('Producto actualizado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error al guardar', 'err');
    }
  };

  const removeProduct = async (id: string) => {
    const ok = await confirm({
      title: 'Eliminar producto',
      message: '¿Eliminar este producto del catálogo?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await api.deleteShopProduct(id);
      showToast('Producto eliminado');
      await onRefresh();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'No se pudo eliminar', 'err');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Cargando productos…
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-emerald-700" aria-hidden />
          <h3 className="text-lg font-black text-zinc-900">Catálogo de productos</h3>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Cargá nombre, precio, foto y descripción. Los productos con «Visible en la web» y precio aparecen en la
          tienda pública para compra con Mercado Pago. Los puntos se configuran en{' '}
          <strong className="font-semibold text-zinc-700">Puntos</strong>.
        </p>

        <ul className="mb-6 divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {shopProducts.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-zinc-500">Todavía no cargaste productos.</li>
          ) : (
            shopProducts.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 px-4 py-4">
                {editingProductId === p.id ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ProductImageField
                      productId={p.id}
                      imageUrl={p.imageUrl}
                      onUploaded={onRefresh}
                      showToast={showToast}
                    />
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                      placeholder="Nombre"
                    />
                    <input
                      value={editUnitPrice}
                      onChange={(e) => setEditUnitPrice(e.target.value)}
                      placeholder="Precio venta"
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-zinc-600">
                      <input
                        type="checkbox"
                        checked={editWebActive}
                        onChange={(e) => setEditWebActive(e.target.checked)}
                      />
                      Visible en la web
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Descripción (opcional)"
                      rows={2}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-sm sm:col-span-2"
                    />
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => void saveEditProduct(p.id)}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProductId(null)}
                        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <ProductImageField
                        productId={p.id}
                        imageUrl={p.imageUrl}
                        onUploaded={onRefresh}
                        showToast={showToast}
                        compact
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-900">{p.name}</p>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{p.description}</p>
                        )}
                        <p className="mt-1 text-sm text-zinc-600">
                          {p.unitPrice ? `Venta: ${p.unitPrice}` : 'Sin precio venta'}
                          {p.webActive === false && (
                            <span className="ml-2 text-xs text-zinc-400">· Oculto en web</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEditProduct(p)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                        aria-label={`Editar ${p.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeProduct(p.id)}
                        className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                        aria-label={`Eliminar ${p.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>

        <form onSubmit={addProduct} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Nuevo producto</label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Ej. Pomada matte"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Precio venta</label>
            <input
              value={productUnitPrice}
              onChange={(e) => setProductUnitPrice(e.target.value)}
              placeholder="Ej. 15000"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
            />
          </div>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={productWebActive}
              onChange={(e) => setProductWebActive(e.target.checked)}
            />
            Visible en la web
          </label>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Descripción</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="Breve descripción para la tienda online"
              rows={2}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Foto</label>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-16 w-16 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
                {pendingImageData ? (
                  <img src={pendingImageData} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-300">
                    <ImagePlus size={24} aria-hidden />
                  </div>
                )}
              </div>
              <input
                ref={newImageRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPendingImageLoading(true);
                  void readProductImagePreview(file)
                    .then((dataUrl) => {
                      setPendingImageData(dataUrl);
                      showToast('Imagen lista — tocá «Agregar producto» para guardar');
                    })
                    .catch((err) =>
                      showToast(err instanceof Error ? err.message : 'No se pudo leer la imagen', 'err')
                    )
                    .finally(() => {
                      setPendingImageLoading(false);
                      if (newImageRef.current) newImageRef.current.value = '';
                    });
                }}
              />
              <button
                type="button"
                disabled={pendingImageLoading}
                onClick={() => newImageRef.current?.click()}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-700 disabled:opacity-50"
              >
                {pendingImageLoading ? 'Procesando…' : pendingImageData ? 'Cambiar imagen' : 'Elegir imagen'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={savingProduct}
            className="rounded-xl bg-[#e5c185] px-5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-[#d4b074] disabled:opacity-50 sm:col-span-2"
          >
            {savingProduct ? 'Agregando…' : 'Agregar producto'}
          </button>
        </form>
      </div>
    </div>
  );
}
