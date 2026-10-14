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
  image_url: string | null
}

type DraftProduct = {
  id: string
  name: string
  unit: string
  quantity: string
  file: File | null
  previewUrl: string | null
}

const UNITS = ["szt.", "but.", "l", "ml", "kg", "g", "opak.", "keg"]

export function InventoryModule({ restaurantId }: { restaurantId: string | null }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)

  // Stany dla Pop-upu dodawania Kategorii
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryDesc, setNewCategoryDesc] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)

  // Stany dla Pop-upu seryjnego dodawania Produktów
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [draftProducts, setDraftProducts] = useState<DraftProduct[]>([])
  const [savingProducts, setSavingProducts] = useState(false)
  const productInputRefs = useRef<(HTMLInputElement | null)[]>([])

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
          .select("id, category_id, name, unit, quantity, image_url")
          .eq("restaurant_id", restaurantId)
          .order("name", { ascending: true }),
      ])

      if (catRes.data) setCategories(catRes.data)
      if (prodRes.data) setProducts(prodRes.data)
      setLoading(false)
    }

    fetchInventory()
  }, [restaurantId])

  // --- KATEGORIE ---
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !newCategoryName.trim()) return

    setSavingCategory(true)
    const { data, error } = await supabase
      .from("product_categories")
      .insert([{
        restaurant_id: restaurantId,
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim() || null,
      }])
      .select("id, name, description")

    setSavingCategory(false)

    if (error) {
      alert("Błąd tworzenia kategorii: " + error.message)
      return
    }

    if (data && data[0]) {
      setCategories(prev => [...prev, data[0]].sort((a, b) => a.name.localeCompare(b.name)))
      setNewCategoryName("")
      setNewCategoryDesc("")
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

  // --- POP-UP DODAWANIA PRODUKTÓW ---
  const openProductModal = () => {
    setDraftProducts([
      { id: crypto.randomUUID(), name: "", unit: "but.", quantity: "0", file: null, previewUrl: null }
    ])
    setIsProductModalOpen(true)
    setTimeout(() => {
      productInputRefs.current[0]?.focus()
    }, 40)
  }

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
      const currentUnit = draftProducts[index]?.unit || "szt."
      const newItem: DraftProduct = {
        id: crypto.randomUUID(),
        name: "",
        unit: currentUnit,
        quantity: "0",
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

  // Pomocnicza funkcja wysyłająca zdjęcie do Supabase Storage i zwracająca publiczny URL
// 1. AUTOMATYCZNA KOMPRESJA ZDJĘCIA W PRZEGLĄDARCE (Z 5MB -> ~20KB WebP)
  const compressImage = (file: File, maxSize = 500, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)

      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        let width = img.width
        let height = img.height

        // Proporcjonalne zmniejszenie do max 500x500 px
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
          resolve(file) // W razie błędu zwracamy oryginał
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

  // 2. WGRYWANIE SKOMPRESOWANEGO ZDJĘCIA DO SUPABASE STORAGE
  const uploadProductImage = async (file: File): Promise<string | null> => {
    if (!restaurantId) return null

    try {
      const compressedBlob = await compressImage(file)
      const filePath = `${restaurantId}/${crypto.randomUUID()}.webp`

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, compressedBlob, {
          contentType: "image/webp",
        })

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

  // 3. USUWANIE FIZYCZNEGO PLIKU Z CHMURY (ŻEBY NIE ZAŚMIECAĆ DARMOWEGO 1GB)
  const deleteFileFromStorage = async (imageUrl: string | null) => {
    if (!imageUrl) return
    const marker = "/product-images/"
    const index = imageUrl.indexOf(marker)
    if (index === -1) return

    const filePath = imageUrl.substring(index + marker.length)
    await supabase.storage.from("product-images").remove([filePath])
  }

  const handleSaveBatchProducts = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !selectedCategory) return

    const valid = draftProducts.filter(p => p.name.trim() !== "")
    if (valid.length === 0) {
      alert("Wpisz nazwę przynajmniej jednego produktu.")
      return
    }

    setSavingProducts(true)

    // Wgrywamy zdjęcia dla tych wierszy, które mają wybrany plik
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
          image_url: uploadedUrl,
        }
      })
    )

    const { data, error } = await supabase
      .from("restaurant_products")
      .insert(rowsToInsert)
      .select("id, category_id, name, unit, quantity, image_url")

    setSavingProducts(false)

    if (error) {
      alert("Błąd zapisywania produktów: " + error.message)
      return
    }

    if (data) {
      setProducts(prev => [...prev, ...(data as Product[])].sort((a, b) => a.name.localeCompare(b.name)))
      setIsProductModalOpen(false)
    }
  }

// Zmiana zdjęcia dla już istniejącego produktu (kasuje stare zdjęcie z chmury!)
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

  // Aktualizacja stanu magazynowego (ilości)
  const handleUpdateQuantity = async (productId: string, newQty: number) => {
    const safeQty = Math.max(0, newQty)
    setProducts(prev => prev.map(p => (p.id === productId ? { ...p, quantity: safeQty } : p)))

    await supabase
      .from("restaurant_products")
      .update({ quantity: safeQty })
      .eq("id", productId)
  }

// Usuwanie produktu razem z jego zdjęciem z chmury
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

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie magazynu...</div>
  }

  const categoryProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory.id)
    : []

  return (
    <div className="space-y-6">
      {/* WIDOK 1: LISTA KATEGORII */}
      {!selectedCategory ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Kategorie Produktów</CardTitle>
                <CardDescription>
                  Wybierz kategorię, aby zarządzać jej produktami, lub utwórz nową.
                </CardDescription>
              </div>
              <Button onClick={() => setIsCategoryModalOpen(true)}>
                + Dodaj kategorię
              </Button>
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
                  const count = products.filter(p => p.category_id === cat.id).length
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat)}
                      className="group relative p-5 rounded-xl border bg-white hover:border-zinc-900 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[120px]"
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
                        <span>Liczba produktów: <strong className="text-zinc-800">{count}</strong></span>
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
      ) : (
        /* WIDOK 2: WNĘTRZE WYBRANEJ KATEGORII */
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
              <Button onClick={openProductModal}>
                + Dodaj produkty
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {categoryProducts.length === 0 ? (
              <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                <p className="text-sm text-zinc-500">
                  Ta kategoria jest jeszcze pusta. Dodaj do niej pierwsze produkty!
                </p>
                <Button variant="outline" onClick={openProductModal}>
                  + Dodaj produkty do kategorii
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {categoryProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="rounded-xl border bg-white overflow-hidden shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      {/* Zdjęcie produktu z opcją podmiany po kliknięciu */}
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

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-zinc-900">{prod.name}</h4>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="text-xs text-zinc-400 hover:text-red-600"
                          >
                            Usuń
                          </button>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">Jednostka: {prod.unit}</p>
                      </div>
                    </div>

                    {/* Dolny pasek stanu ilościowego */}
                    <div className="px-4 py-3 bg-zinc-50 border-t flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600">Stan:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(prod.id, prod.quantity - 1)}
                          className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="min-w-[60px] text-center text-xs font-bold text-zinc-900">
                          {prod.quantity} {prod.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(prod.id, prod.quantity + 1)}
                          className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* POP-UP 1: NOWA KATEGORIA */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <h2 className="text-lg font-bold text-zinc-900">Nowa Kategoria</h2>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Nazwa kategorii</Label>
                <Input
                  placeholder="np. Alkohole mocne, Syropy, Owoce..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Krótki opis (opcjonalnie)</Label>
                <Input
                  placeholder="np. Wódki, giny, rumy i whisky na głównym barze"
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCategoryModalOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={savingCategory}>
                  {savingCategory ? "Tworzenie..." : "Utwórz kategorię"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP 2: SERYJNE DODAWANIE PRODUKTÓW DO KATEGORII */}
      {isProductModalOpen && selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-3xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">
                  Dodaj produkty do: {selectedCategory.name}
                </h2>
                <p className="text-xs text-zinc-500">
                  Wpisz nazwę produktu i naciśnij <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-semibold">Enter</kbd>, aby przejść do kolejnej pozycji.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveBatchProducts}>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                {draftProducts.map((item, index) => (
                  <div key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                    <span className="w-6 text-right text-sm font-semibold text-zinc-400 select-none shrink-0">
                      {index + 1}.
                    </span>

                    {/* Podgląd / Wybór zdjęcia */}
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

                    {/* Nazwa produktu */}
                    <Input
                      ref={(el) => { productInputRefs.current[index] = el }}
                      placeholder={index === 0 ? "np. Gin Bombay Sapphire 0.7l..." : "Kolejny produkt..."}
                      value={item.name}
                      onChange={(e) => updateDraftProduct(index, { name: e.target.value })}
                      onKeyDown={(e) => handleProductKeyDown(e, index)}
                      className="flex-1 min-w-[180px]"
                    />

                    {/* Ilość początkowa */}
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="Ilość"
                      value={item.quantity}
                      onChange={(e) => updateDraftProduct(index, { quantity: e.target.value })}
                      className="w-20 text-center"
                      title="Ilość początkowa"
                    />

                    {/* Jednostka miary */}
                    <select
                      value={item.unit}
                      onChange={(e) => updateDraftProduct(index, { unit: e.target.value })}
                      className="h-10 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700"
                    >
                      {UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        if (draftProducts.length === 1) {
                          setDraftProducts([{ id: crypto.randomUUID(), name: "", unit: "but.", quantity: "0", file: null, previewUrl: null }])
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
                    const lastUnit = draftProducts[draftProducts.length - 1]?.unit || "but."
                    setDraftProducts(prev => [
                      ...prev,
                      { id: crypto.randomUUID(), name: "", unit: lastUnit, quantity: "0", file: null, previewUrl: null }
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
                <Button type="button" variant="outline" onClick={() => setIsProductModalOpen(false)} disabled={savingProducts}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={savingProducts}>
                  {savingProducts
                    ? "Wgrywanie i zapisywanie..."
                    : `Zapisz produkty (${draftProducts.filter(p => p.name.trim() !== "").length})`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}