import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  Store,
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  AlertCircle,
  Truck,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Plus,
  Minus,
  Sparkles,
  Info,
  Check,
  FileCheck,
} from 'lucide-react';
import printingService from '../../services/printingService';
import orderService from '../../services/orderService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';

const StudentPrinting = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Wizard Step (1: Upload & Shop, 2: Configure, 3: Fulfillment & Review)
  const [activeStep, setActiveStep] = useState(1);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileMetadata, setFileMetadata] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Shop Selection
  const [printingShops, setPrintingShops] = useState([]);
  const [loadingShops, setLoadingShops] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState(null);

  // Print Configuration Options
  const [pageSelection, setPageSelection] = useState('ALL'); // 'ALL' | 'CUSTOM'
  const [customRange, setCustomRange] = useState('');
  const [rangeError, setRangeError] = useState(null);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('BW'); // 'BW' | 'COLOR'
  const [paperSize, setPaperSize] = useState('A4');
  const [printSides, setPrintSides] = useState('DOUBLE_SIDED'); // 'SINGLE_SIDED' | 'DOUBLE_SIDED'
  const [bindingType, setBindingType] = useState('NONE'); // 'NONE' | 'CORNER_STAPLE' | 'SPIRAL' | etc.
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Fulfillment State
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP'); // 'PICKUP' | 'DELIVERY'
  const [pickupSlots, setPickupSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [addressForm, setAddressForm] = useState({
    fullName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : '',
    phoneNumber: user?.phone_number || '',
    hostelName: '',
    roomNumber: '',
    landmark: '',
  });

  // Price Calculation State
  const [priceQuote, setPriceQuote] = useState(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Fetch printing shops on mount
  useEffect(() => {
    loadPrintingShops();
  }, []);

  const loadPrintingShops = async () => {
    setLoadingShops(true);
    try {
      const data = await printingService.getPrintingShops();
      setPrintingShops(data);
      if (data.length > 0 && !selectedShopId) {
        setSelectedShopId(data[0].shop);
      }
    } catch (err) {
      console.error('Failed to load printing shops:', err);
    } finally {
      setLoadingShops(false);
    }
  };

  // Selected shop config helper
  const selectedConfig = printingShops.find((s) => s.shop === selectedShopId) || printingShops[0];

  // Fetch pickup slots when shop changes and pickup is selected
  useEffect(() => {
    if (selectedShopId && fulfillmentType === 'PICKUP') {
      fetchPickupSlots(selectedShopId);
    }
  }, [selectedShopId, fulfillmentType]);

  const fetchPickupSlots = async (shopId) => {
    setLoadingSlots(true);
    try {
      const slots = await orderService.getPickupSlots(shopId);
      setPickupSlots(slots);
      const available = slots.filter((s) => s.is_available);
      if (available.length > 0) {
        setSelectedSlotId(available[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch pickup slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Calculate live authoritative price when parameters change
  useEffect(() => {
    if (!selectedShopId || !fileMetadata) return;

    let targetPages = fileMetadata.page_count;
    if (pageSelection === 'CUSTOM') {
      // Basic count from range if valid
      const parsedCount = evaluateRangePages(customRange, fileMetadata.page_count);
      if (!parsedCount) return;
      targetPages = parsedCount;
    }

    const timer = setTimeout(() => {
      fetchPriceQuote(targetPages);
    }, 250);

    return () => clearTimeout(timer);
  }, [
    selectedShopId,
    fileMetadata?.page_count,
    pageSelection,
    customRange,
    copies,
    colorMode,
    paperSize,
    printSides,
    bindingType,
    fulfillmentType,
  ]);

  const fetchPriceQuote = async (pages) => {
    setIsCalculatingPrice(true);
    try {
      const res = await printingService.calculatePrice({
        shop: selectedShopId,
        total_pages: pages,
        copies: copies,
        color_mode: colorMode,
        paper_size: paperSize,
        print_sides: printSides,
        binding_type: bindingType,
        fulfillment_type: fulfillmentType,
      });
      setPriceQuote(res);
    } catch (err) {
      console.error('Price calculation failed:', err);
    } finally {
      setIsCalculatingPrice(false);
    }
  };

  // Helper: validate and estimate custom page count
  const evaluateRangePages = (rangeStr, maxPages) => {
    if (!rangeStr || !rangeStr.trim()) {
      setRangeError('Custom page range cannot be empty.');
      return null;
    }
    const parts = rangeStr.split(',').map((p) => p.trim()).filter(Boolean);
    const pages = new Set();

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
          setRangeError(`Invalid range '${part}'. Use positive numbers.`);
          return null;
        }
        if (start > end) {
          setRangeError(`Start page (${start}) cannot exceed end page (${end}).`);
          return null;
        }
        if (end > maxPages) {
          setRangeError(`Range '${part}' exceeds document page limit (${maxPages}).`);
          return null;
        }
        for (let i = start; i <= end; i++) pages.add(i);
      } else {
        const num = parseInt(part, 10);
        if (isNaN(num) || num <= 0) {
          setRangeError(`Invalid page number '${part}'.`);
          return null;
        }
        if (num > maxPages) {
          setRangeError(`Page ${num} exceeds document length (${maxPages}).`);
          return null;
        }
        pages.add(num);
      }
    }

    setRangeError(null);
    return pages.size;
  };

  // File Upload Handlers
  const handleFileChange = async (file) => {
    if (!file) return;
    setUploadError(null);

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files (.pdf) are currently supported for printing.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadError(`File exceeds 25 MB maximum upload limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
      return;
    }

    setSelectedFile(file);
    setIsInspecting(true);

    try {
      const data = await printingService.inspectDocument(file);
      setFileMetadata(data);
      setCustomRange('');
      setRangeError(null);
    } catch (err) {
      console.error('Inspection failed:', err);
      setUploadError(err.response?.data?.message || 'Failed to inspect PDF structure. Ensure file is not corrupted.');
      setSelectedFile(null);
      setFileMetadata(null);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Order Submission Handler
  const handlePlacePrintOrder = async () => {
    if (isSubmitting) return;
    setSubmitError(null);

    if (!selectedFile || !fileMetadata) {
      setSubmitError('Please upload and verify a PDF document first.');
      return;
    }

    if (!selectedShopId) {
      setSubmitError('Please select a campus printing shop.');
      return;
    }

    if (pageSelection === 'CUSTOM' && rangeError) {
      setSubmitError('Please fix custom page range errors before ordering.');
      return;
    }

    if (fulfillmentType === 'PICKUP' && !selectedSlotId) {
      setSubmitError('Please select an available pickup time window.');
      return;
    }

    if (fulfillmentType === 'DELIVERY') {
      if (!addressForm.fullName.trim() || !addressForm.phoneNumber.trim() || !addressForm.hostelName.trim() || !addressForm.roomNumber.trim()) {
        setSubmitError('Please fill in all required campus delivery address fields.');
        return;
      }
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('shop', selectedShopId);
    formData.append('fulfillment_type', fulfillmentType);
    if (fulfillmentType === 'PICKUP') {
      formData.append('pickup_slot', selectedSlotId);
    } else {
      const formattedAddress = [
        `Name: ${addressForm.fullName.trim()}`,
        `Phone: ${addressForm.phoneNumber.trim()}`,
        `Hostel/Building: ${addressForm.hostelName.trim()}`,
        `Room/Door: ${addressForm.roomNumber.trim()}`,
        addressForm.landmark.trim() ? `Landmark: ${addressForm.landmark.trim()}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      formData.append('delivery_address', formattedAddress);
    }
    formData.append('payment_method', 'COD');
    formData.append('color_mode', colorMode);
    formData.append('paper_size', paperSize);
    formData.append('print_sides', printSides);
    formData.append('binding_type', bindingType);
    formData.append('page_selection_type', pageSelection);
    if (pageSelection === 'CUSTOM') {
      formData.append('custom_page_range', customRange.trim());
    }
    formData.append('copies', copies);
    if (specialInstructions.trim()) {
      formData.append('special_instructions', specialInstructions.trim());
    }

    try {
      const res = await printingService.createPrintOrder(formData);
      const createdJob = res.order || res;

      // Navigate to confirmation / details
      navigate(`/student/printing/orders/${createdJob.id}`, {
        state: { isNewOrder: true, printJob: createdJob },
      });
    } catch (err) {
      console.error('Print order failed:', err);
      const errorMsg =
        err.response?.data?.message ||
        (err.response?.data ? Object.values(err.response.data).flat().join(' ') : 'Failed to place print order. Please try again.');
      setSubmitError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bindingOptions = [
    { key: 'NONE', label: 'No Binding', desc: 'Loose sheets stapled with clip if needed', price: 0 },
    { key: 'CORNER_STAPLE', label: 'Corner Staple', desc: 'Secure heavy-duty corner staple', price: selectedConfig?.corner_staple_price || 5 },
    { key: 'SPIRAL', label: 'Spiral Binding', desc: 'Plastic comb/coil with clear front cover', price: selectedConfig?.spiral_binding_price || 30 },
    { key: 'SOFT_BIND', label: 'Soft Thermal Bind', desc: 'Book-style glued paperback binding', price: selectedConfig?.soft_bind_price || 60 },
    { key: 'HARDCOVER', label: 'Project Hardcover', desc: 'Embossed golden letter hardcover thesis', price: selectedConfig?.hardcover_price || 150 },
  ];

  const filteredBindingOptions = bindingOptions.filter((b) =>
    (selectedConfig?.supported_binding_types || ['NONE', 'CORNER_STAPLE', 'SPIRAL']).includes(b.key)
  );

  return (
    <div className="page-container" style={{ maxWidth: '1050px' }}>
      <PageHeader
        title="Document Printing & Xerox"
        subtitle="Upload assignments, configure high-speed printing, and pick up without waiting in line"
        actions={
          <Link to="/student/printing/orders">
            <Button variant="outline" size="sm" leftIcon={Printer}>
              My Print Jobs
            </Button>
          </Link>
        }
      />

      {/* Global Error Notice */}
      {submitError && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            color: '#991b1b',
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{submitError}</span>
        </div>
      )}

      {/* Main Grid: Left Steps, Right Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* STEP 1: Upload PDF */}
          <Card title="1. Upload Document (PDF)">
            {!selectedFile ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                  backgroundColor: isDragging ? 'var(--primary-50)' : 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary-50)',
                    color: 'var(--primary-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem',
                  }}
                >
                  <UploadCloud size={28} />
                </div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Drag & drop your PDF file here, or browse
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
                  Maximum file size: 25 MB • PDF format only
                </p>
                <Button variant="primary" size="sm">
                  Select PDF Document
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e.target.files[0])}
                  accept="application/pdf"
                  style={{ display: 'none' }}
                />
              </div>
            ) : (
              <div
                style={{
                  padding: '1.25rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1.5px solid var(--primary-200)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--primary-600)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FileCheck size={24} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                      {selectedFile.name}
                    </h4>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB •{' '}
                      {isInspecting ? (
                        <span style={{ color: 'var(--primary-600)' }}>Extracting pages with pypdf...</span>
                      ) : (
                        <strong style={{ color: 'var(--primary-700)' }}>{fileMetadata?.page_count} Pages Verified</strong>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    setFileMetadata(null);
                  }}
                >
                  Change File
                </Button>
              </div>
            )}

            {uploadError && (
              <div style={{ color: 'var(--danger-600)', fontSize: '0.825rem', marginTop: '0.75rem' }}>
                {uploadError}
              </div>
            )}
          </Card>

          {/* STEP 2: Select Printing Shop */}
          <Card title="2. Select Campus Print Center">
            {loadingShops ? (
              <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading verified campus printing shops...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {printingShops.map((cfg) => {
                  const isSelected = selectedShopId === cfg.shop;
                  return (
                    <div
                      key={cfg.id}
                      onClick={() => setSelectedShopId(cfg.shop)}
                      style={{
                        padding: '1.15rem',
                        borderRadius: 'var(--radius-lg)',
                        border: `2px solid ${isSelected ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                        backgroundColor: isSelected ? 'var(--primary-50)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Store size={16} color="var(--primary-600)" />
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                            {cfg.shop_name}
                          </span>
                        </div>
                        {isSelected && <Badge variant="primary">Selected</Badge>}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
                        {cfg.shop_location}
                      </div>

                      <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div>
                          B/W: <strong>₹{parseFloat(cfg.bw_rate_per_page).toFixed(2)}/pg</strong> • Color: <strong>₹{parseFloat(cfg.color_rate_per_page).toFixed(2)}/pg</strong>
                        </div>
                        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={13} />
                          <span>Turnaround: ~{cfg.base_prep_time_mins} mins</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* STEP 3: Configure Print Specifications */}
          <Card title="3. Configure Printing Options">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Page Range Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Print Range
                </label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="pageSelection"
                      value="ALL"
                      checked={pageSelection === 'ALL'}
                      onChange={() => {
                        setPageSelection('ALL');
                        setRangeError(null);
                      }}
                    />
                    <span>All Pages {fileMetadata ? `(1 – ${fileMetadata.page_count})` : ''}</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="pageSelection"
                      value="CUSTOM"
                      checked={pageSelection === 'CUSTOM'}
                      onChange={() => setPageSelection('CUSTOM')}
                    />
                    <span>Custom Page Range</span>
                  </label>
                </div>

                {pageSelection === 'CUSTOM' && (
                  <div style={{ marginTop: '0.65rem' }}>
                    <input
                      type="text"
                      placeholder="e.g. 1-5, 8, 10-12"
                      value={customRange}
                      onChange={(e) => setCustomRange(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${rangeError ? 'var(--danger-500)' : 'var(--border-medium)'}`,
                        fontSize: '0.9rem',
                      }}
                    />
                    {rangeError && (
                      <div style={{ color: 'var(--danger-500)', fontSize: '0.785rem', marginTop: '0.35rem' }}>
                        {rangeError}
                      </div>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                      Enter comma-separated single pages or ranges. Example: <code>1-3, 7, 10-14</code>
                    </span>
                  </div>
                )}
              </div>

              {/* Number of Copies */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Number of Copies (Duplicate Sets)
                </label>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: 'var(--bg-surface)',
                  }}
                >
                  <button
                    onClick={() => setCopies((c) => Math.max(1, c - 1))}
                    style={{ padding: '0.5rem 0.85rem', border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Minus size={15} />
                  </button>
                  <span style={{ minWidth: '35px', textAlign: 'center', fontWeight: 700, fontSize: '0.95rem' }}>
                    {copies}
                  </span>
                  <button
                    onClick={() => setCopies((c) => Math.min(50, c + 1))}
                    style={{ padding: '0.5rem 0.85rem', border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              {/* Color Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Color Output
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div
                    onClick={() => setColorMode('BW')}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${colorMode === 'BW' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                      backgroundColor: colorMode === 'BW' ? 'var(--primary-50)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Black & White (B/W)</div>
                    <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Standard academic crisp laser printing • ₹{parseFloat(selectedConfig?.bw_rate_per_page || 1.5).toFixed(2)}/pg
                    </div>
                  </div>

                  <div
                    onClick={() => setColorMode('COLOR')}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${colorMode === 'COLOR' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                      backgroundColor: colorMode === 'COLOR' ? 'var(--primary-50)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Full Color</div>
                    <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      High-resolution charts, graphs & diagrams • ₹{parseFloat(selectedConfig?.color_rate_per_page || 6).toFixed(2)}/pg
                    </div>
                  </div>
                </div>
              </div>

              {/* Print Sides & Paper Size */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Print Sides
                  </label>
                  <select
                    value={printSides}
                    onChange={(e) => setPrintSides(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value="DOUBLE_SIDED">Double-Sided (Back-to-Back Duplex)</option>
                    <option value="SINGLE_SIDED">Single-Sided (One page per sheet)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Paper Size
                  </label>
                  <select
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      fontSize: '0.9rem',
                    }}
                  >
                    {(selectedConfig?.supported_paper_sizes || ['A4']).map((sz) => (
                      <option key={sz} value={sz}>
                        {sz} {sz === 'A3' ? '(2x scale rate)' : '(Standard Document)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Binding Options */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Binding Option
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filteredBindingOptions.map((opt) => {
                    const isSelected = bindingType === opt.key;
                    return (
                      <div
                        key={opt.key}
                        onClick={() => setBindingType(opt.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1.5px solid ${isSelected ? 'var(--primary-600)' : 'var(--border-light)'}`,
                          backgroundColor: isSelected ? 'var(--primary-50)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <input
                            type="radio"
                            name="bindingType"
                            checked={isSelected}
                            onChange={() => setBindingType(opt.key)}
                          />
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {opt.label}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                              {opt.desc}
                            </span>
                          </div>
                        </div>

                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          {opt.price === 0 ? 'FREE' : `+ ₹${parseFloat(opt.price).toFixed(2)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Special Instructions */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Operator Notes / Special Instructions (Optional)
                </label>
                <textarea
                  rows="2"
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Please print cover page on 100 GSM paper; spiral bind with black comb."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          </Card>

          {/* STEP 4: Fulfillment (Pickup vs Delivery) */}
          <Card title="4. Choose Fulfillment Method">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div
                onClick={() => setFulfillmentType('PICKUP')}
                style={{
                  border: `2px solid ${fulfillmentType === 'PICKUP' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                  backgroundColor: fulfillmentType === 'PICKUP' ? 'var(--primary-50)' : 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.15rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <Store size={20} color="var(--primary-600)" />
                  <Badge variant="success">FREE (₹0)</Badge>
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Counter Pickup</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Collect at the shop counter without waiting in print queues.
                </p>
              </div>

              <div
                onClick={() => setFulfillmentType('DELIVERY')}
                style={{
                  border: `2px solid ${fulfillmentType === 'DELIVERY' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                  backgroundColor: fulfillmentType === 'DELIVERY' ? 'var(--primary-50)' : 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.15rem',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <Truck size={20} color="var(--primary-600)" />
                  <Badge variant="primary">₹15 Delivery</Badge>
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Hostel Delivery</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Printed documents delivered directly to your hostel room.
                </p>
              </div>
            </div>

            {/* Pickup Slots */}
            {fulfillmentType === 'PICKUP' && (
              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                <h5 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.65rem' }}>
                  Select Counter Pickup Slot
                </h5>
                {loadingSlots ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading pickup slots...</div>
                ) : pickupSlots.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No pickup slots available.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {pickupSlots.map((slot) => {
                      const isSelected = selectedSlotId === slot.id;
                      const freeSpots = slot.capacity - slot.booked_count;
                      const isFull = !slot.is_available || freeSpots <= 0;
                      return (
                        <div
                          key={slot.id}
                          onClick={() => {
                            if (!isFull) setSelectedSlotId(slot.id);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.65rem 0.85rem',
                            borderRadius: 'var(--radius-md)',
                            border: `1.5px solid ${isSelected ? 'var(--primary-600)' : 'var(--border-light)'}`,
                            backgroundColor: isSelected ? 'var(--primary-50)' : 'var(--bg-surface)',
                            cursor: isFull ? 'not-allowed' : 'pointer',
                            opacity: isFull ? 0.6 : 1,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <input
                              type="radio"
                              name="printPickupSlot"
                              checked={isSelected}
                              disabled={isFull}
                              onChange={() => setSelectedSlotId(slot.id)}
                            />
                            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                              {slot.date} • {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                            </span>
                          </div>
                          <Badge variant={isFull ? 'danger' : freeSpots <= 3 ? 'warning' : 'neutral'}>
                            {isFull ? 'Full' : `${freeSpots} spots left`}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Delivery Address */}
            {fulfillmentType === 'DELIVERY' && (
              <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <h5 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>Campus / Hostel Delivery Details</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="Recipient Name *"
                    value={addressForm.fullName}
                    onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                    style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Phone Number *"
                    value={addressForm.phoneNumber}
                    onChange={(e) => setAddressForm({ ...addressForm, phoneNumber: e.target.value })}
                    style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="Hostel / Academic Block *"
                    value={addressForm.hostelName}
                    onChange={(e) => setAddressForm({ ...addressForm, hostelName: e.target.value })}
                    style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Room No *"
                    value={addressForm.roomNumber}
                    onChange={(e) => setAddressForm({ ...addressForm, roomNumber: e.target.value })}
                    style={{ padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ORDER SUMMARY SIDEBAR */}
        <div>
          <Card title="Print Order Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.925rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Print Center:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {selectedConfig?.shop_name || 'Select Shop'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Document Pages:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {priceQuote ? `${priceQuote.print_cost / priceQuote.rate_per_page / copies} pgs × ${copies} copies` : `${fileMetadata?.page_count || 0} pgs`}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Print Output:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {colorMode === 'COLOR' ? 'Color' : 'B/W'} • {printSides === 'DOUBLE_SIDED' ? 'Duplex' : 'Single'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Printing Subtotal:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ₹{priceQuote ? parseFloat(priceQuote.print_cost).toFixed(2) : '0.00'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Binding Charge:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {priceQuote && parseFloat(priceQuote.binding_charge) > 0
                    ? `₹${parseFloat(priceQuote.binding_charge).toFixed(2)}`
                    : 'FREE'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Fulfillment ({fulfillmentType === 'PICKUP' ? 'Pickup' : 'Delivery'}):</span>
                <span style={{ fontWeight: 600, color: fulfillmentType === 'DELIVERY' ? 'var(--text-primary)' : 'var(--success-600)' }}>
                  {fulfillmentType === 'DELIVERY' ? '₹15.00' : 'FREE'}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '0.85rem',
                  marginTop: '0.25rem',
                  borderTop: '1px solid var(--border-light)',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Estimated Total:</span>
                <span style={{ color: 'var(--primary-600)' }}>
                  ₹{priceQuote ? parseFloat(priceQuote.total_amount).toFixed(2) : '0.00'}
                </span>
              </div>

              {priceQuote?.estimated_prep_time_mins && (
                <div
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--primary-50)',
                    color: 'var(--primary-800)',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <Clock size={16} />
                  <span>Estimated Operator Prep Time: <strong>~{priceQuote.estimated_prep_time_mins} mins</strong></span>
                </div>
              )}

              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  color: 'var(--text-muted)',
                  fontSize: '0.785rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.45rem',
                  lineHeight: 1.4,
                }}
              >
                <ShieldCheck size={16} color="var(--primary-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Authoritative Backend Pricing: Page count & pricing calculated by server.</span>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting || !selectedFile || !fileMetadata || (pageSelection === 'CUSTOM' && !!rangeError)}
                onClick={handlePlacePrintOrder}
              >
                {isSubmitting
                  ? 'Submitting to Queue...'
                  : `Place Print Order • ₹${priceQuote ? parseFloat(priceQuote.total_amount).toFixed(2) : '0.00'}`}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudentPrinting;
