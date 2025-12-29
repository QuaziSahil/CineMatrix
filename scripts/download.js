/* ===========================
   CineMatrix - Download Module
   Image Export with html2canvas
   =========================== */

const Download = {
    /**
     * Convert an image URL to base64 using a proxy approach
     * @param {HTMLImageElement} img - The image element to convert
     * @returns {Promise<string>} - Base64 data URL
     */
    async imageToBase64(img) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Create a new image with crossOrigin set
            const tempImg = new Image();
            tempImg.crossOrigin = 'anonymous';

            tempImg.onload = () => {
                canvas.width = tempImg.naturalWidth;
                canvas.height = tempImg.naturalHeight;
                ctx.drawImage(tempImg, 0, 0);
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    resolve(dataUrl);
                } catch (e) {
                    // If CORS fails, return original URL
                    resolve(img.src);
                }
            };

            tempImg.onerror = () => {
                resolve(img.src); // Fallback to original
            };

            // Use a CORS proxy if needed
            const url = img.src;
            if (url && url.startsWith('http')) {
                // Try loading directly first
                tempImg.src = url;
            } else {
                resolve(img.src);
            }
        });
    },

    /**
     * Generate image from graph card and trigger download
     * @param {string} format - Image format (png, jpeg, webp)
     * @param {string} showTitle - Title of the show for filename
     */
    async downloadImage(format, showTitle) {
        const graphCard = document.getElementById('graphCard');

        if (!graphCard) {
            UI.showToast('Nothing to download', 'error');
            return;
        }

        try {
            // Show loading state on button
            const downloadBtn = document.getElementById('downloadBtn');
            const saveBtn = document.getElementById('saveImageBtn');
            const originalText = downloadBtn ? downloadBtn.innerHTML : '';
            if (downloadBtn) {
                downloadBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Generating...</span>';
                downloadBtn.disabled = true;
            }
            if (saveBtn) saveBtn.disabled = true;

            // Pre-convert poster image to base64
            const posterImg = graphCard.querySelector('.show-poster');
            let originalSrc = null;
            if (posterImg && posterImg.src && posterImg.src.startsWith('http')) {
                try {
                    originalSrc = posterImg.src;
                    const base64 = await this.imageToBase64(posterImg);
                    posterImg.src = base64;
                } catch (e) {
                    console.log('Image conversion failed, using original');
                }
            }

            // Configure html2canvas options
            const options = {
                backgroundColor: '#0a0a0a',
                scale: 2,
                useCORS: true,
                allowTaint: false, // Changed to false to avoid taint issues
                logging: false,
                imageTimeout: 15000,
                onclone: (clonedDoc) => {
                    const clonedCard = clonedDoc.getElementById('graphCard');
                    if (clonedCard) {
                        clonedCard.style.transform = 'none';
                        clonedCard.style.borderRadius = '16px';
                    }
                }
            };

            // Generate canvas
            const canvas = await html2canvas(graphCard, options);

            // Restore original image source
            if (originalSrc && posterImg) {
                posterImg.src = originalSrc;
            }

            // Convert to image data URL
            let mimeType, quality, extension;

            switch (format) {
                case 'jpeg':
                    mimeType = 'image/jpeg';
                    quality = 0.95;
                    extension = 'jpg';
                    break;
                case 'webp':
                    mimeType = 'image/webp';
                    quality = 0.95;
                    extension = 'webp';
                    break;
                case 'png':
                default:
                    mimeType = 'image/png';
                    quality = 1;
                    extension = 'png';
                    break;
            }

            const dataUrl = canvas.toDataURL(mimeType, quality);

            // Create download link
            const link = document.createElement('a');
            const safeTitle = this.sanitizeFilename(showTitle);
            link.download = `${safeTitle}_CineMatrix.${extension}`;
            link.href = dataUrl;

            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Restore button
            if (downloadBtn) {
                downloadBtn.innerHTML = originalText;
                downloadBtn.disabled = false;
            }
            if (saveBtn) saveBtn.disabled = false;

            // Show success toast
            UI.showToast(`Image downloaded as ${extension.toUpperCase()}!`, 'success');

        } catch (error) {
            console.error('Download error:', error);

            // Restore button
            const downloadBtn = document.getElementById('downloadBtn');
            const saveBtn = document.getElementById('saveImageBtn');
            if (downloadBtn) {
                downloadBtn.innerHTML = '<span class="btn-icon">📥</span><span class="btn-text">Download Image</span>';
                downloadBtn.disabled = false;
            }
            if (saveBtn) saveBtn.disabled = false;

            UI.showToast('Failed to generate image', 'error');
        }
    },

    /**
     * Sanitize filename to remove invalid characters
     * @param {string} filename - Original filename
     * @returns {string} - Sanitized filename
     */
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/-+/g, '-') // Replace multiple dashes with single
            .substring(0, 50) // Limit length
            .toLowerCase();
    },

    /**
     * Copy image to clipboard (for modern browsers)
     * @param {string} showTitle - Title of the show
     */
    async copyToClipboard(showTitle) {
        const graphCard = document.getElementById('graphCard');

        if (!graphCard) {
            UI.showToast('Nothing to copy', 'error');
            return;
        }

        try {
            // Check if clipboard API is supported
            if (!navigator.clipboard || !navigator.clipboard.write) {
                UI.showToast('Clipboard not supported', 'error');
                return;
            }

            const canvas = await html2canvas(graphCard, {
                backgroundColor: '#0a0a0a',
                scale: 2,
                useCORS: true,
                allowTaint: true
            });

            // Convert canvas to blob
            canvas.toBlob(async (blob) => {
                try {
                    const item = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([item]);
                    UI.showToast('Image copied to clipboard!', 'success');
                } catch (err) {
                    console.error('Clipboard write failed:', err);
                    UI.showToast('Failed to copy to clipboard', 'error');
                }
            }, 'image/png');

        } catch (error) {
            console.error('Copy error:', error);
            UI.showToast('Failed to copy image', 'error');
        }
    },

    /**
     * Share image using Web Share API (mobile)
     * @param {string} showTitle - Title of the show
     */
    async shareImage(showTitle) {
        // Check if Web Share API is supported
        if (!navigator.share) {
            // Fallback: copy link or show message
            try {
                await navigator.clipboard.writeText(window.location.href);
                UI.showToast('Link copied to clipboard!', 'success');
            } catch (err) {
                UI.showToast('Sharing not supported on this device', 'error');
            }
            return;
        }

        const graphCard = document.getElementById('graphCard');

        if (!graphCard) {
            UI.showToast('Nothing to share', 'error');
            return;
        }

        try {
            const canvas = await html2canvas(graphCard, {
                backgroundColor: '#0a0a0a',
                scale: 2,
                useCORS: true,
                allowTaint: true
            });

            // Convert canvas to blob
            canvas.toBlob(async (blob) => {
                const safeTitle = this.sanitizeFilename(showTitle);
                const file = new File([blob], `${safeTitle}_CineMatrix.png`, { type: 'image/png' });

                try {
                    await navigator.share({
                        title: `${showTitle} - Episode Ratings`,
                        text: `Check out the episode ratings for ${showTitle}! Generated by CineMatrix.`,
                        files: [file]
                    });

                    UI.showToast('Shared successfully!', 'success');
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('Share failed:', err);

                        // Fallback to sharing without file
                        try {
                            await navigator.share({
                                title: `${showTitle} - Episode Ratings`,
                                text: `Check out the episode ratings for ${showTitle}! Generated by CineMatrix.`,
                                url: window.location.href
                            });
                        } catch (e) {
                            UI.showToast('Failed to share', 'error');
                        }
                    }
                }
            }, 'image/png');

        } catch (error) {
            console.error('Share error:', error);
            UI.showToast('Failed to generate share image', 'error');
        }
    }
};

// Export for use in other modules
window.Download = Download;
