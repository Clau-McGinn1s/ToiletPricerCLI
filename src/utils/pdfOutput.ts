import { jsPDF } from "jspdf";

export interface PdfProduct {
  name: string;
  price: number;
  price_alt: number | null;
  color: string | null;
  description: string | null;
  image: string | null;
  url: string | null;
}

export interface PdfProductEntry {
  label: string;
  product: PdfProduct;
}

async function loadImageAsBase64(imagePath: string): Promise<string | null> {
  try {
    const response = await fetch(imagePath);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function getProductPrice(product: PdfProduct): number {
  const price = product.price_alt ?? product.price ?? 0;
  return typeof price === "string" ? parseFloat(price) || 0 : price;
}

export async function generateBathroomPDF(
  products: PdfProductEntry[],
  totalPrice: number
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title - compact
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Bathroom Builder - Product Selection", pageWidth / 2, 12, { align: "center" });

  let yPos = 20;
  const lineHeight = 4;
  const imageSize = 25;
  const rowHeight = 52;

  for (const entry of products) {
    const { label, product } = entry;

    // Product type header - inline with content
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(59, 130, 246);
    doc.text(label, 14, yPos);

    // Load and add image
    const imagePath = product.image || "/media/default.jpg";
    const imageData = await loadImageAsBase64(imagePath);

    const imageX = 14;
    const imageY = yPos + 2;
    const textStartX = 42;

    if (imageData) {
      try {
        doc.addImage(imageData, "JPEG", imageX, imageY, imageSize, imageSize);
      } catch {
        // Image failed to load
      }
    }

    // Product details - compact
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);

    let detailY = yPos + 2;

    // Name (truncated)
    doc.setFont("helvetica", "bold");
    const truncatedName = product.name.length > 50 ? product.name.substring(0, 50) + "..." : product.name;
    doc.text(truncatedName, textStartX, detailY);
    detailY += lineHeight;

    doc.setFont("helvetica", "normal");

    // Price inline
    const priceValue = getProductPrice(product);
    let priceText = `$${priceValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
    if (product.price_alt && product.price !== product.price_alt) {
      priceText += ` (was $${product.price.toLocaleString("es-MX", { minimumFractionDigits: 2 })})`;
    }
    doc.text(priceText, textStartX, detailY);
    detailY += lineHeight;

    // Color
    if (product.color) {
      doc.text(`Color: ${product.color}`, textStartX, detailY);
      detailY += lineHeight;
    }

    // Description (truncated to ~80 chars)
    if (product.description) {
      const shortDesc = product.description.length > 80
        ? product.description.substring(0, 80) + "..."
        : product.description;
      const descLines = doc.splitTextToSize(shortDesc, pageWidth - textStartX - 14);
      doc.text(descLines.slice(0, 2), textStartX, detailY);
      detailY += Math.min(descLines.length, 2) * lineHeight;
    }

    // URL link
    if (product.url) {
      doc.setTextColor(59, 130, 246);
      doc.setFontSize(7);
      doc.textWithLink("View on Home Depot", textStartX, detailY, { url: product.url });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(8);
    }

    yPos += rowHeight;

    // Thin separator
    doc.setDrawColor(220, 220, 220);
    doc.line(14, yPos - 3, pageWidth - 14, yPos - 3);
  }

  // Total
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(59, 130, 246);
  doc.text(`Total: $${totalPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos + 2, { align: "right" });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated on ${new Date().toLocaleDateString()} | ToiletAPI`, pageWidth / 2, 290, { align: "center" });

  doc.save("bathroom-selection.pdf");
}
