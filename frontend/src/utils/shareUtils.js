/**
 * Utility functions for Product and Shop sharing.
 * Supports Web Share API (native mobile/desktop share sheet) with graceful fallback
 * to clipboard copy and animated feedback notifications.
 */

// Global toast timer reference
let toastTimeout = null;

export function showShareToast(message) {
  if (typeof document === 'undefined') return;

  // Remove existing toast if present
  const existing = document.getElementById('smart-share-toast');
  if (existing) {
    existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);
  }

  const toast = document.createElement('div');
  toast.id = 'smart-share-toast';
  toast.setAttribute('role', 'alert');
  toast.style.position = 'fixed';
  toast.style.bottom = '5.5rem';
  toast.style.right = '1.5rem';
  toast.style.zIndex = '9999';
  toast.style.backgroundColor = '#0f172a';
  toast.style.color = '#ffffff';
  toast.style.padding = '0.75rem 1.25rem';
  toast.style.borderRadius = '0.5rem';
  toast.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '0.65rem';
  toast.style.fontSize = '0.875rem';
  toast.style.fontWeight = '500';
  toast.style.border = '1px solid #334155';
  toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';

  // SVG Check Icon
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);

  // Trigger entrance transition
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 2600);
}

export async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, attempting fallback:', err);
    }
  }

  // Fallback for non-secure contexts or legacy browsers
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    return successful;
  } catch (err) {
    console.error('Copy to clipboard failed:', err);
    return false;
  }
}

/**
 * Share a product using Web Share API or Clipboard fallback.
 * @param {Object} product - Product data object
 * @returns {Promise<{success: boolean, method: string}>}
 */
export async function shareProduct(product) {
  if (!product || !product.id) return { success: false };

  const url = `${window.location.origin}/products/${product.id}`;
  const price = product.price ? `₹${parseFloat(product.price).toFixed(2)}` : '';
  const shopName = product.shop_name || product.shop?.name || '';
  const title = product.name || 'Stationery Product';

  const textParts = [
    product.name,
    price ? `Price: ${price}` : null,
    shopName ? `Available at: ${shopName}` : null,
  ].filter(Boolean);
  const text = textParts.join(' | ');

  // Try native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { success: true, method: 'native' };
    } catch (err) {
      // AbortError indicates user cancelled share sheet — do not treat as error
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.warn('Native share failed, falling back to clipboard:', err);
    }
  }

  // Clipboard Fallback
  const copied = await copyToClipboard(url);
  if (copied) {
    showShareToast('Product link copied.');
  }
  return { success: copied, method: 'clipboard' };
}

/**
 * Share a shop using Web Share API or Clipboard fallback.
 * @param {Object} shop - Shop data object
 * @returns {Promise<{success: boolean, method: string}>}
 */
export async function shareShop(shop) {
  if (!shop || !shop.id) return { success: false };

  const url = `${window.location.origin}/shops/${shop.id}`;
  const location = shop.campus_location || shop.address || '';
  const title = shop.name || 'Campus Stationery Shop';

  const textParts = [
    shop.name,
    shop.shop_type_display || shop.shop_type || null,
    location ? `Location: ${location}` : null,
  ].filter(Boolean);
  const text = textParts.join(' | ');

  // Try native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { success: true, method: 'native' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, cancelled: true };
      }
      console.warn('Native share failed, falling back to clipboard:', err);
    }
  }

  // Clipboard Fallback
  const copied = await copyToClipboard(url);
  if (copied) {
    showShareToast('Shop link copied.');
  }
  return { success: copied, method: 'clipboard' };
}
