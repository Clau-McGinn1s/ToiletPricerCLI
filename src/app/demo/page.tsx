"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { generateBathroomPDF, PdfProductEntry } from "@/utils/pdfOutput";

interface Product {
  id: number;
  name: string;
  price: number;
  price_alt: number | null;
  color: string | null;
  description: string | null;
  image: string | null;
  type: string;
  match_field: string | null;
  url: string | null;
}

interface ProductsByType {
  wc: Product[];
  sink: Product[];
  faucet: Product[];
  "shower-head": Product[];
}

const PRODUCT_TYPES = [
  { key: "wc", label: "Toilet" },
  { key: "sink", label: "Sink" },
  { key: "faucet", label: "Faucet" },
  { key: "shower-head", label: "Shower Head" },
] as const;

export default function DemoPage() {
  const [products, setProducts] = useState<ProductsByType>({
    wc: [],
    sink: [],
    faucet: [],
    "shower-head": [],
  });
  const [selected, setSelected] = useState<Record<string, Product | null>>({
    wc: null,
    sink: null,
    faucet: null,
    "shower-head": null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const responses = await Promise.all(
          PRODUCT_TYPES.map((type) =>
            fetch(`/api/toilet?type=${type.key}`).then((res) => res.json())
          )
        );

        const productsByType: ProductsByType = {
          wc: [],
          sink: [],
          faucet: [],
          "shower-head": [],
        };

        PRODUCT_TYPES.forEach((type, index) => {
          productsByType[type.key] = responses[index].products || [];
        });

        setProducts(productsByType);

        // Set first product as default selection for each type
        const initialSelected: Record<string, Product | null> = {};
        PRODUCT_TYPES.forEach((type) => {
          initialSelected[type.key] = productsByType[type.key][0] || null;
        });
        setSelected(initialSelected);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch products");
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  const handleSelect = (type: string, productId: number) => {
    const product = products[type as keyof ProductsByType].find(
      (p) => p.id === productId
    );
    setSelected((prev) => ({ ...prev, [type]: product || null }));
  };

  const getPrice = (product: Product | null): number => {
    if (!product) return 0;
    const price = product.price_alt ?? product.price ?? 0;
    return typeof price === "string" ? parseFloat(price) || 0 : price;
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      const pdfProducts: PdfProductEntry[] = PRODUCT_TYPES
        .filter((type) => selected[type.key] !== null)
        .map((type) => ({
          label: type.label,
          product: {
            name: selected[type.key]!.name,
            price: selected[type.key]!.price,
            price_alt: selected[type.key]!.price_alt,
            color: selected[type.key]!.color,
            description: selected[type.key]!.description,
            image: selected[type.key]!.image,
            url: selected[type.key]!.url,
          },
        }));

      await generateBathroomPDF(pdfProducts, totalPrice);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const totalPrice = PRODUCT_TYPES.reduce(
    (sum, type) => sum + getPrice(selected[type.key]),
    0
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <p className="text-zinc-600 dark:text-zinc-400">Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <p className="text-zinc-500 dark:text-zinc-500 text-sm">
            Make sure to run: npm run cli -- set-up:fresh
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2 text-center">
          ToiletAPI, Bathroom Builder Demo
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8 text-center">
          Select products to build your bathroom setup
        </p>

        <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 p-4 bg-zinc-100 dark:bg-zinc-700 font-semibold text-zinc-700 dark:text-zinc-200 text-sm">
            <div className="col-span-2">Type</div>
            <div className="col-span-3 text-center">Product</div>
            <div className="col-span-2 text-center">Image</div>
            <div className="col-span-3 text-center">Description</div>
            <div className="col-span-2 text-right">Price</div>
          </div>

          {/* Product Rows */}
          {PRODUCT_TYPES.map((type) => {
            const product = selected[type.key];
            const typeProducts = products[type.key];

            return (
              <div
                key={type.key}
                className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-200 dark:border-zinc-700 items-center"
              >
                {/* Type Label */}
                <div className="col-span-2">
                  <span className="font-medium text-zinc-900 dark:text-white">
                    {type.label}
                  </span>
                </div>

                {/* Selector */}
                <div className="col-span-3">
                  {typeProducts.length > 0 ? (
                    <select
                      value={product?.id || ""}
                      onChange={(e) =>
                        handleSelect(type.key, parseInt(e.target.value))
                      }
                      className="w-full p-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white text-sm"
                    >
                      {typeProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name.length > 40
                            ? p.name.substring(0, 40) + "..."
                            : p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-zinc-500 text-sm">
                      No products available
                    </span>
                  )}
                </div>

                  {/* Image */}
                <div className="col-span-2 mx-auto">
                  {product?.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      className="w-30 h-30 object-cover rounded-lg bg-zinc-100 dark:bg-zinc-700"
                      width={600}
                      height={600}
                    />
                  ) : (
                     <Image
                      src={"/media/default.jpg"}
                      alt={"default-img"}
                      className="w-20 h-20 object-cover rounded-lg bg-zinc-100 dark:bg-zinc-700"
                      width={600}
                      height={600}
                    />
                  )
                  }
                </div>

                {/* Description */}
                <div className="col-span-3">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-3">
                    {product?.description || "No description available"}
                  </p>
                </div>

                {/* Price */}
                <div className="col-span-2 text-right">
                  <span className="text-lg font-semibold text-zinc-900 dark:text-white">
                    ${getPrice(product).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                  {product?.price_alt && product.price !== product.price_alt && (
                    <p className="text-xs text-zinc-500 line-through">
                      ${product.price.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Total Row */}
          <div className="grid grid-cols-12 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20">
            <div className="col-span-10">
              <span className="font-bold text-lg text-zinc-900 dark:text-white">
                Total
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ${totalPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-4 items-center">
          <Link
            href="/"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            &larr; Back to Home
          </Link>
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPdf}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {generatingPdf ? "Generating PDF..." : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
