"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Category = {
  id: string
  name: string
  description: string | null
}

type Product = {
  id: string
  category_id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  image_url: string | null
}

type DraftProduct = {
  id: string
  name: string
  unit: string
  quantity: string
  min_quantity: string
  file: File | null
  previewUrl: string | null
}

type SortOption = "smart_asc" | "smart_desc" | "name_asc"

// Kolejność jednostek dla "niewidocznych podkategorii" przy sortowaniu
const UNITS = ["but.", "keg", "l", "ml", "kg", "g", "szt.", "opak."]

// Sprawdza, czy produkt kwalifikuje się do "Braków" (stan 0 lub poniżej progu)
const isProductShortage = (prod: Product) => {
  const qty = Number(prod.quantity) || 0
  const minQty = Number(prod.min_quantity) || 0
  return qty <= 0 || qty < minQty
}

const getUnitRank = (unit: string) => {
  const idx = UNITS.indexOf(unit)
  return idx === -1 ? 999 : idx
}

// ============================================================================
// KOMPONENT POP-UPU: NOWA KATEGORIA
// ============================================================================
function CategoryModal({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, desc: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName("")
      setDesc("")
      setSaving(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave(name.trim(), desc.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <h2 className="text-lg font-bold text-zinc-900">Nowa Kategoria</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Nazwa kategorii</Label>
            <Input
              placeholder="np. Alkohole mocne, Syropy, Owoce..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Krótki opis (opcjonalnie)</Label>
            <Input
              placeholder="np. Wódki, giny, rumy i whisky na głównym barze"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Anuluj
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Tworzenie..." : "Utwórz kategorię"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// KOMPONENT POP-UPU: SERYJNE DODAWANIE PRODUKTÓW Z PROGIEM MINIMALNYM
// ============================================================================
function ProductBatchModal({
  isOpen,
  categoryName,
  onClose,
  onSaveBatch,
}: {
  isOpen: boolean
  categoryName: string
  onClose: () => void
  onSaveBatch: (validProducts: DraftProduct[]) => Promise<void>
}) {
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([])
  const [saving, setSaving] = useState(false)
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (isOpen) {
      setDraftProducts([
        { id: crypto.randomUUID(), name: "", unit: "but.", quantity: "0", min_quantity: "0", file: null, previewUrl: null }
      ])
      setSaving(false)
      setTimeout(() => {
        productInputRefs.current[0]?.focus()
      }, 40)
    }
  }, [isOpen])

  if (!isOpen) return null

  const updateDraftProduct = (index: number, patch: Partial<DraftProduct>) => {
    setDraftProducts(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleDraftFileChange = (index: number, file: File | null) => {
    if (!file) {
      updateDraftProduct(index, { file: null, previewUrl: null })
      return
    }
    const previewUrl = URL.createObjectURL(file)
    updateDraftProduct(index, { file, previewUrl })
  }

  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const currentUnit = draftProducts[index]?.unit || "but."
      const currentMin = draftProducts[index]?.min_quantity || "0"
      const newItem: DraftProduct = {
        id: crypto.randomUUID(),
        name: "",
        unit: currentUnit,
        quantity: "0",
        min_quantity: currentMin,
        file: null,
        previewUrl: null,
      }
      setDraftProducts(prev => {
        const copy = [...prev]
        copy.splice(index + 1, 0, newItem)
        return copy
      })
      setTimeout(() => {
        productInputRefs.current[index + 1]?.focus()
      }, 15)
    } else if (e.key === "Backspace" && draftProducts[index].name === "" && draftProducts.length > 1) {
      e.preventDefault()
      setDraftProducts(prev => prev.filter((_, i) => i !== index))
      const prevIndex = Math.max(0, index - 1)
      setTimeout(() => {
        productInputRefs.current[prevIndex]?.focus()
      }, 15)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = draftProducts.filter(p => p.name.trim() !== "")
    if (valid.length === 0) {
      alert("Wpisz nazwę przynajmniej jednego produktu.")
      return
    }
    setSaving(true)
    await onSaveBatch(valid)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-4xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Dodaj produkty do: {categoryName}
            </h2>
            <p className="text-xs text-zinc-500">
              Wpisz nazwę, ustaw stan oraz próg minimalny i naciśnij <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-semibold">Enter</kbd>, aby przejść do kolejnej pozycji.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
            {/* Nagłówki kolumn pomocniczych */}
            <div className="hidden sm:flex items-center gap-2.5 text-[11px] font-semibold text-zinc-400 uppercase px-1">
              <span className="w-6"></span>
              <span className="w-10 text-center">Foto</span>
              <span className="flex-1">Nazwa produktu</span>
              <span className="w-24 text-center">Stan obecny</span>
              <span className="w-24 text-center">Próg min.</span>
              <span className="w-20 text-center">Jedn.</span>
              <span className="w-6"></span>
            </div>

            {draftProducts.map((item, index) => (
              <div key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                <span className="w-6 text-right text-sm font-semibold text-zinc-400 select-none shrink-0">
                  {index + 1}.
                </span>

                <label
                  title="Dodaj zdjęcie produktu"
                  className="w-10 h-10 rounded-lg border border-dashed border-zinc-300 hover:border-zinc-900 bg-zinc-50 flex items-center justify-center cursor-pointer overflow-hidden shrink-0"
                >
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt="Podgląd" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-base">📷</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleDraftFileChange(index, e.target.files?.[0] || null)}
                  />
                </label>

                <Input
                  ref={(el) => { productInputRefs.current[index] = el }}
                  placeholder={index === 0 ? "np. Gin Bombay Sapphire 0.7l..." : "Kolejny produkt..."}
                  value={item.name}
                  onChange={(e) => updateDraftProduct(index, { name: e.target.value })}
                  onKeyDown={(e) => handleProductKeyDown(e, index)}
                  className="flex-1 min-w-[180px]"
                />

                {/* Ilość obecna */}
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Stan"
                  value={item.quantity}
                  onChange={(e) => updateDraftProduct(index, { quantity: e.target.value })}
                  className="w-24 text-center"
                  title="Stan obecny"
                />

                {/* Próg minimalny */}
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Próg"
                  value={item.min_quantity}
                  onChange={(e) => updateDraftProduct(index, { min_quantity: e.target.value })}
                  className="w-24 text-center border-amber-200 focus-visible:ring-amber-500"
                  title="Próg minimalny (poniżej tej wartości produkt trafi do Braków)"
                />

                {/* Jednostka */}
                <select
                  value={item.unit}
                  onChange={(e) => updateDraftProduct(index, { unit: e.target.value })}
                  className="h-10 w-20 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700"
                >
                  {UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (draftProducts.length === 1) {
                      setDraftProducts([{ id: crypto.randomUUID(), name: "", unit: "but.", quantity: "0", min_quantity: "0", file: null, previewUrl: null }])
                    } else {
                      setDraftProducts(prev => prev.filter((_, i) => i !== index))
                    }
                  }}
                  className="text-zinc-400 hover:text-red-500 px-1.5 py-1 text-lg leading-none shrink-0"
                >
                  ×
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-zinc-600"
              onClick={() => {
                const nextIdx = draftProducts.length
                const lastItem = draftProducts[draftProducts.length - 1]
                setDraftProducts(prev => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    unit: lastItem?.unit || "but.",
                    quantity: "0",
                    min_quantity: lastItem?.min_quantity || "0",
                    file: null,
                    previewUrl: null,
                  }
                ])
                setTimeout(() => {
                  productInputRefs.current[nextIdx]?.focus()
                }, 15)
              }}
            >
              + Dodaj kolejny wiersz
            </Button>
          </div>

          <div className="px-6 py-4 bg-zinc-50 border-t flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Anuluj
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Kompresja i zapisywanie..."
                : `Zapisz produkty (${draftProducts.filter(p => p.name.trim() !== "").length})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// GŁÓWNY MODUŁ MAGAZYNU (PRODUKTY)
// ============================================================================
export function InventoryModule({ restaurantId }: { restaurantId: string | null }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  
  // Widok wszystkich braków (stan 0 lub poniżej progu)
  const [showShortagesOnly, setShowShortagesOnly] = useState(false)
  
  // Domyślne sortowanie wielopiętrowe: Poniżej progu -> Jednostka -> Ilość -> A-Z
  const [sortBy, setSortBy] = useState<SortOption>("smart_asc")

  const [loading, setLoading] = useState(true)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)

  useEffect(() => {
    if (!restaurantId) return

    const fetchInventory = async () => {
      setLoading(true)
      const [catRes, prodRes] = await Promise.all([
        supabase
          .from("product_categories")
          .select("id, name, description")
          .eq("restaurant_id", restaurantId)
          .order("name", { ascending: true }),
        supabase
          .from("restaurant_products")
          .select("id, category_id, name, unit, quantity, min_quantity, image_url")
          .eq("restaurant_id", restaurantId)
          .order("name", { ascending: true }),
      ])

      if (catRes.data) setCategories(catRes.data)
      if (prodRes.data) {
        setProducts(
          prodRes.data.map((p: any) => ({
            ...p,
            quantity: Number(p.quantity) || 0,
            min_quantity: Number(p.min_quantity) || 0,
          }))
        )
      }
      setLoading(false)
    }

    fetchInventory()
  }, [restaurantId])

  // --- KOMPRESJA ZDJĘĆ DO WEBP (~20KB) I OBSŁUGA STORAGE ---
  const compressImage = (file: File, maxSize = 500, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        let width = img.width
        let height = img.height

        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          resolve(file)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else resolve(file)
          },
          "image/webp",
          quality
        )
      }

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }

      img.src = objectUrl
    })
  }

  const uploadProductImage = async (file: File): Promise<string | null> => {
    if (!restaurantId) return null
    try {
      const compressedBlob = await compressImage(file)
      const filePath = `${restaurantId}/${crypto.randomUUID()}.webp`

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, compressedBlob, { contentType: "image/webp" })

      if (uploadError) {
        console.error("Błąd wgrywania zdjęcia:", uploadError)
        return null
      }

      const { data } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (err) {
      console.error("Błąd kompresji zdjęcia:", err)
      return null
    }
  }

  const deleteFileFromStorage = async (imageUrl: string | null) => {
    if (!imageUrl) return
    const marker = "/product-images/"
    const index = imageUrl.indexOf(marker)
    if (index === -1) return

    const filePath = imageUrl.substring(index + marker.length)
    await supabase.storage.from("product-images").remove([filePath])
  }

  // --- KATEGORIE ---
  const handleCreateCategory = async (name: string, desc: string) => {
    if (!restaurantId) return

    const { data, error } = await supabase
      .from("product_categories")
      .insert([{
        restaurant_id: restaurantId,
        name,
        description: desc || null,
      }])
      .select("id, name, description")

    if (error) {
      alert("Błąd tworzenia kategorii: " + error.message)
      return
    }

    if (data && data[0]) {
      setCategories(prev => [...prev, data[0]].sort((a, b) => a.name.localeCompare(b.name, "pl")))
      setIsCategoryModalOpen(false)
    }
  }

  const handleDeleteCategory = async (cat: Category, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć kategorię "${cat.name}" wraz ze wszystkimi przypisanymi do niej produktami?`
    )
    if (!confirmed) return

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", cat.id)

    if (error) {
      alert("Błąd podczas usuwania kategorii: " + error.message)
      return
    }

    setCategories(prev => prev.filter(c => c.id !== cat.id))
    setProducts(prev => prev.filter(p => p.category_id !== cat.id))
    if (selectedCategory?.id === cat.id) setSelectedCategory(null)
  }

  // --- PRODUKTY ---
  const handleSaveBatchProducts = async (valid: DraftProduct[]) => {
    if (!restaurantId || !selectedCategory) return

    const rowsToInsert = await Promise.all(
      valid.map(async (item) => {
        let uploadedUrl: string | null = null
        if (item.file) {
          uploadedUrl = await uploadProductImage(item.file)
        }
        return {
          restaurant_id: restaurantId,
          category_id: selectedCategory.id,
          name: item.name.trim(),
          unit: item.unit,
          quantity: parseFloat(item.quantity) || 0,
          min_quantity: parseFloat(item.min_quantity) || 0,
          image_url: uploadedUrl,
        }
      })
    )

    const { data, error } = await supabase
      .from("restaurant_products")
      .insert(rowsToInsert)
      .select("id, category_id, name, unit, quantity, min_quantity, image_url")

    if (error) {
      alert("Błąd zapisywania produktów: " + error.message)
      return
    }

    if (data) {
      setProducts(prev => [...prev, ...(data as Product[])])
      setIsProductModalOpen(false)
    }
  }

  const handleUpdateExistingProductImage = async (productId: string, file: File | null) => {
    if (!file) return
    const existingProduct = products.find(p => p.id === productId)

    const url = await uploadProductImage(file)
    if (!url) {
      alert("Nie udało się wgrać zdjęcia.")
      return
    }

    const { error } = await supabase
      .from("restaurant_products")
      .update({ image_url: url })
      .eq("id", productId)

    if (!error) {
      if (existingProduct?.image_url) {
        await deleteFileFromStorage(existingProduct.image_url)
      }
      setProducts(prev => prev.map(p => (p.id === productId ? { ...p, image_url: url } : p)))
    }
  }

  // Edycja stanu ilościowego
  const handleQuantityChangeLocal = (productId: string, val: string) => {
    const parsed = parseFloat(val)
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) } : p))
    )
  }

  const handleSaveQuantityToDb = async (productId: string, newQty: number) => {
    const safeQty = Math.max(0, newQty)
    setProducts(prev => prev.map(p => (p.id === productId ? { ...p, quantity: safeQty } : p)))

    await supabase
      .from("restaurant_products")
      .update({ quantity: safeQty })
      .eq("id", productId)
  }

  // Edycja progu minimalnego na kafelku
  const handleMinQuantityChangeLocal = (productId: string, val: string) => {
    const parsed = parseFloat(val)
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, min_quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) } : p))
    )
  }

  const handleSaveMinQuantityToDb = async (productId: string, newMinQty: number) => {
    const safeMin = Math.max(0, newMinQty)
    setProducts(prev => prev.map(p => (p.id === productId ? { ...p, min_quantity: safeMin } : p)))

    await supabase
      .from("restaurant_products")
      .update({ min_quantity: safeMin })
      .eq("id", productId)
  }

  const handleDeleteProduct = async (productId: string) => {
    const existingProduct = products.find(p => p.id === productId)

    const { error } = await supabase
      .from("restaurant_products")
      .delete()
      .eq("id", productId)

    if (!error) {
      if (existingProduct?.image_url) {
        await deleteFileFromStorage(existingProduct.image_url)
      }
      setProducts(prev => prev.filter(p => p.id !== productId))
    }
  }

  const getCategoryName = (catId: string) => {
    return categories.find(c => c.id === catId)?.name || "Bez kategorii"
  }

  // ==========================================================================
  // WIELOPIĘTROWE SORTOWANIE:
  // 1. Poniżej progu (lub 0) -> Powyżej progu
  // 2. Niewidoczne podkategorie jednostek (but., keg, l, ml...)
  // 3. Stan ilościowy (rosnąco lub malejąco)
  // 4. Alfabetycznie (A-Z)
  // ==========================================================================
  const sortProductsList = (list: Product[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name, "pl")
      }

      // Krok 1: Poniżej progu / 0 na górze, powyżej progu niżej
      const aShortage = isProductShortage(a)
      const bShortage = isProductShortage(b)
      if (aShortage !== bShortage) {
        return aShortage ? -1 : 1
      }

      // Krok 2: Niewidoczna podkategoria jednostki (żeby nie mieszać np. butelek z ml)
      const aUnitRank = getUnitRank(a.unit)
      const bUnitRank = getUnitRank(b.unit)
      if (aUnitRank !== bUnitRank) {
        return aUnitRank - bUnitRank
      }

      // Krok 3: Stan ilościowy w obrębie danej jednostki
      if (a.quantity !== b.quantity) {
        return sortBy === "smart_desc"
          ? b.quantity - a.quantity
          : a.quantity - b.quantity
      }

      // Krok 4: Alfabetycznie
      return a.name.localeCompare(b.name, "pl")
    })
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie magazynu...</div>
  }

  // Wszystkie produkty w "Brakach" (stan 0 lub poniżej progu)
  const shortageProducts = sortProductsList(products.filter(isProductShortage))

  // Produkty w aktualnie wybranej kategorii
  const categoryProducts = selectedCategory
    ? sortProductsList(products.filter(p => p.category_id === selectedCategory.id))
    : []

  // Wspólny renderer kafelka produktu
  const renderProductCard = (prod: Product, showCategoryBadge = false) => {
    const isZero = Number(prod.quantity) <= 0
    const isBelowThreshold = !isZero && Number(prod.quantity) < Number(prod.min_quantity)
    const isShortage = isZero || isBelowThreshold

    return (
      <div
        key={prod.id}
        className={`rounded-xl border bg-white overflow-hidden shadow-xs flex flex-col justify-between transition-colors ${
          isZero
            ? "border-red-300 ring-1 ring-red-100"
            : isBelowThreshold
            ? "border-amber-300 ring-1 ring-amber-100"
            : "border-zinc-200"
        }`}
      >
        <div>
          {/* Zdjęcie produktu */}
          <div className="relative h-40 w-full bg-zinc-100 flex items-center justify-center overflow-hidden group">
            {prod.image_url ? (
              <img
                src={prod.image_url}
                alt={prod.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-zinc-400 text-xs flex flex-col items-center gap-1">
                <span className="text-2xl">🍾</span>
                <span>Brak zdjęcia</span>
              </div>
            )}

            {/* Plakietka statusu na zdjęciu */}
            {isZero && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-bold shadow-xs">
                BRAK (0)
              </span>
            )}
            {isBelowThreshold && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-bold shadow-xs">
                PONIŻEJ PROGU
              </span>
            )}

            {/* Plakietka kategorii (w widoku wszystkich braków) */}
            {showCategoryBadge && (
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium">
                📁 {getCategoryName(prod.category_id)}
              </span>
            )}

            <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold cursor-pointer">
              📷 {prod.image_url ? "Zmień zdjęcie" : "Dodaj zdjęcie"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpdateExistingProductImage(prod.id, e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-zinc-900">{prod.name}</h4>
              <button
                type="button"
                onClick={() => handleDeleteProduct(prod.id)}
                className="text-xs text-zinc-400 hover:text-red-600 shrink-0"
              >
                Usuń
              </button>
            </div>

            {/* Wiersz edycji progu minimalnego */}
            <div className="flex items-center justify-between text-xs text-zinc-500 pt-1">
              <span>Próg min.:</span>
              <div className="inline-flex items-center gap-1">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={prod.min_quantity}
                  onChange={(e) => handleMinQuantityChangeLocal(prod.id, e.target.value)}
                  onBlur={(e) => handleSaveMinQuantityToDb(prod.id, parseFloat(e.target.value) || 0)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur()
                  }}
                  className="h-6 w-16 px-1.5 text-center text-xs bg-zinc-50"
                />
                <span className="text-zinc-400 min-w-[26px]">{prod.unit}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dolny pasek stanu ilościowego */}
        <div className={`px-4 py-3 border-t flex items-center justify-between gap-2 ${
          isZero ? "bg-red-50/60" : isBelowThreshold ? "bg-amber-50/60" : "bg-zinc-50"
        }`}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-600">Stan:</span>
            {!isZero && (
              <button
                type="button"
                onClick={() => handleSaveQuantityToDb(prod.id, 0)}
                title="Wyzeruj stan jednym kliknięciem"
                className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 bg-white text-zinc-500 hover:text-red-600 hover:border-red-200"
              >
                0
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSaveQuantityToDb(prod.id, Number((prod.quantity - 1).toFixed(2)))}
              className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold shrink-0"
            >
              -
            </button>
            <Input
              type="number"
              step="any"
              min="0"
              value={prod.quantity}
              onChange={(e) => handleQuantityChangeLocal(prod.id, e.target.value)}
              onBlur={(e) => handleSaveQuantityToDb(prod.id, parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="h-7 w-16 px-1.5 text-center text-xs font-bold bg-white"
            />
            <span className="text-xs font-medium text-zinc-600 min-w-[28px]">
              {prod.unit}
            </span>
            <button
              type="button"
              onClick={() => handleSaveQuantityToDb(prod.id, Number((prod.quantity + 1).toFixed(2)))}
              className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold shrink-0"
            >
              +
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* WIDOK 1: GŁÓWNA STRONA KATEGORII */}
      {!selectedCategory && !showShortagesOnly && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Kategorie Produktów</CardTitle>
                <CardDescription>
                  Wybierz kategorię, aby zarządzać jej produktami, lub sprawdź braki magazynowe.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {/* PRZYCISK 1 KLIKNIĘCIA: BRAKI (STAN 0 ORAZ PONIŻEJ PROGU) */}
                <Button
                  type="button"
                  variant={shortageProducts.length > 0 ? "destructive" : "outline"}
                  onClick={() => setShowShortagesOnly(true)}
                >
                  🚨 Braki ({shortageProducts.length})
                </Button>

                <Button onClick={() => setIsCategoryModalOpen(true)}>
                  + Dodaj kategorię
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                <p className="text-sm text-zinc-500">
                  Nie masz jeszcze żadnych kategorii produktów (np. Alkohole, Syropy, Owoce).
                </p>
                <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)}>
                  Utwórz pierwszą kategorię
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categories.map((cat) => {
                  const catProds = products.filter(p => p.category_id === cat.id)
                  const shortageCount = catProds.filter(isProductShortage).length

                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat)}
                      className="group relative p-5 rounded-xl border bg-white hover:border-zinc-900 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[130px]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                            📁 {cat.name}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCategory(cat, e)}
                            title="Usuń kategorię"
                            className="text-xs text-zinc-400 hover:text-red-600 px-1.5 py-0.5 rounded"
                          >
                            Usuń
                          </button>
                        </div>
                        {cat.description && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{cat.description}</p>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <span>Produkty: <strong className="text-zinc-800">{catProds.length}</strong></span>
                          {shortageCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-[11px]">
                              Braki: {shortageCount}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-zinc-900 group-hover:translate-x-1 transition-transform">
                          Otwórz →
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WIDOK 2: BRAKI (STAN 0 ORAZ PONIŻEJ PROGU) */}
      {showShortagesOnly && (
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setShowShortagesOnly(false)}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 mb-1"
                >
                  ← Wróć do kategorii produktów
                </button>
                <CardTitle className="text-xl text-red-600">
                  🚨 Braki ({shortageProducts.length})
                </CardTitle>
                <CardDescription>
                  Produkty wyzerowane oraz te, których ilość spadła poniżej ustalonego progu minimalnego.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowShortagesOnly(false)}>
                Powrót do kategorii
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {shortageProducts.length === 0 ? (
              <div className="text-center py-12 space-y-2 border-2 border-dashed rounded-xl bg-green-50/40 border-green-200">
                <p className="text-sm font-semibold text-green-800">
                  Wszystkie produkty w lokalu są powyżej swoich progów minimalnych! 🎉
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {shortageProducts.map(prod => renderProductCard(prod, true))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WIDOK 3: WNĘTRZE WYBRANEJ KATEGORII + SORTOWANIE */}
      {selectedCategory && !showShortagesOnly && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 mb-1"
                >
                  ← Wróć do wszystkich kategorii
                </button>
                <CardTitle className="text-xl">📁 {selectedCategory.name}</CardTitle>
                {selectedCategory.description && (
                  <CardDescription>{selectedCategory.description}</CardDescription>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* WYBÓR SORTOWANIA */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-500">Sortuj:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="h-9 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800"
                  >
                    <option value="smart_asc">Braki → Jednostka → Ilość rosnąco → A-Z</option>
                    <option value="smart_desc">Braki → Jednostka → Ilość malejąco → A-Z</option>
                    <option value="name_asc">Tylko alfabetycznie (A–Z)</option>
                  </select>
                </div>

                <Button onClick={() => setIsProductModalOpen(true)}>
                  + Dodaj produkty
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {categoryProducts.length === 0 ? (
              <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                <p className="text-sm text-zinc-500">
                  Ta kategoria jest jeszcze pusta. Dodaj do niej pierwsze produkty!
                </p>
                <Button variant="outline" onClick={() => setIsProductModalOpen(true)}>
                  + Dodaj produkty do kategorii
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categoryProducts.map(prod => renderProductCard(prod, false))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WYDZIELONE POP-UPY */}
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={handleCreateCategory}
      />

      <ProductBatchModal
        isOpen={isProductModalOpen && !!selectedCategory}
        categoryName={selectedCategory?.name || ""}
        onClose={() => setIsProductModalOpen(false)}
        onSaveBatch={handleSaveBatchProducts}
      />
    </div>
  )
}