import React, { useState, useEffect } from 'react';
import { Package, X } from 'lucide-react';
import { globalToast } from '../lib/toast';
import { formatDateToDMY } from '../lib/dateUtils';
// from 'lucide-react';
import { Note } from '../types';
import { safeLocalStorage } from '../lib/safeLocalStorage';

interface ShipmentRecord {
  id: string;
  influencerName: string;
  product: string;
  orderDate: string;
  platform: string;
  cost?: number | string;
  orderId?: string;
}

interface RecentShipmentsFabProps {
  notebookNotes?: Note[];
  selectedMonth?: string;
  selectedYear?: string;
  onCreateTaskForShipment?: (influencerName: string, product: string, orderDate?: string, cost?: number | string, orderId?: string, platform?: string) => void;
}

export default function RecentShipmentsFab({ selectedMonth, selectedYear, notebookNotes = [], onCreateTaskForShipment }: RecentShipmentsFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);

  useEffect(() => {
    loadShipments();
  }, [selectedMonth, selectedYear, notebookNotes]);

  const loadShipments = () => {
    try {
      const notes: Note[] = notebookNotes || [];
      
      const allShipments: ShipmentRecord[] = [];
      notes.forEach(note => {
        if (note.sampleDetails && note.sampleDetails.length > 0) {
          note.sampleDetails.forEach((sample: any) => {
            allShipments.push({
              id: sample.id,
              influencerName: note.creatorName || note.title || 'Unknown Influencer',
              product: sample.product || 'Unknown Product',
              orderDate: sample.orderDate,
              platform: sample.platform,
              cost: sample.cost,
              orderId: sample.orderId
            });
          });
        }
      });

      // Filter by selectedMonth and selectedYear if provided
      let filteredShipments = allShipments;

      const getSafeDateParts = (dateStr: string) => {
        if (!dateStr) return { m: '', y: '' };
        const parts = dateStr.split('-');
        if (parts.length >= 3) {
           // Handle both YYYY-MM-DD and DD-MM-YYYY
           if (parts[0].length === 4) {
             return { y: parts[0], m: parts[1] };
           } else if (parts[2].length === 4) {
             return { y: parts[2], m: parts[1] };
           }
        }
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return { m: '', y: '' };
        return { 
          m: (date.getMonth() + 1).toString().padStart(2, '0'), 
          y: date.getFullYear().toString() 
        };
      };

      if (selectedMonth && selectedMonth !== 'ALL' && selectedYear && selectedYear !== 'ALL') {
         filteredShipments = allShipments.filter(shipment => {
           const { m, y } = getSafeDateParts(shipment.orderDate);
           return m === selectedMonth.padStart(2, '0') && y === selectedYear;
         });
      } else if (selectedYear && selectedYear !== 'ALL') {
         filteredShipments = allShipments.filter(shipment => {
           const { y } = getSafeDateParts(shipment.orderDate);
           return y === selectedYear;
         });
      } else if (selectedMonth && selectedMonth !== 'ALL') {
         filteredShipments = allShipments.filter(shipment => {
           const { m } = getSafeDateParts(shipment.orderDate);
           return m === selectedMonth.padStart(2, '0');
         });
      }

      filteredShipments.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
      
      setShipments(filteredShipments);
    } catch (e) {
      console.error("Failed to load shipments", e);
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[90]">
        <button 
          onClick={() => { setIsOpen(true); loadShipments(); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 flex items-center justify-center relative group"
          title="Recent Product Shipments"
        >
          <Package className="w-6 h-6 group-hover:scale-110 transition-transform" />
          {shipments.length > 0 && !isOpen && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
               {shipments.length}
            </span>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                <h3 className="font-bold text-lg">Product Shipments</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-indigo-100 hover:text-white bg-indigo-800/30 hover:bg-indigo-800/50 p-1.5 rounded-full transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto">
              {shipments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No shipments found for {selectedMonth !== 'ALL' ? `Month ${selectedMonth}` : 'All Months'}{selectedYear !== 'ALL' ? `, ${selectedYear}` : ''}.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {shipments.map((shipment, idx) => (
                    <div key={shipment.id || idx} className="p-4 hover:bg-gray-50 transition-colors flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onCreateTaskForShipment) { onCreateTaskForShipment(shipment.influencerName, shipment.product, shipment.orderDate, shipment.cost, shipment.orderId, shipment.platform); globalToast.success('Task created successfully for ' + shipment.influencerName + '!'); } }} className="font-bold text-indigo-600 hover:text-indigo-800 text-left transition-colors cursor-pointer decoration-indigo-300 hover:underline">{shipment.influencerName}</button>
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap border border-indigo-100">{shipment.orderDate ? formatDateToDMY(shipment.orderDate) : ''}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1 text-sm text-gray-600">
                        <span className="truncate pr-2" title={shipment.product}>{shipment.product}</span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{shipment.platform}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
