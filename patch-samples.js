const fs = require('fs');
let code = fs.readFileSync('src/components/SmartAINotebook.tsx', 'utf8');

const newStates = `
  const [addingSampleToNoteId, setAddingSampleToNoteId] = useState<string | null>(null);
  const [samplePlatform, setSamplePlatform] = useState<'PTG' | 'AMAJON' | 'FLIPKART' | 'OTHER'>('PTG');
  const [sampleCost, setSampleCost] = useState<string>('');
  const [sampleOrderId, setSampleOrderId] = useState<string>('');
  const [sampleOrderDate, setSampleOrderDate] = useState<string>('');

  const handleSaveSample = (noteId: string) => {
    if (!sampleOrderId.trim() || !sampleOrderDate) {
      alert("Please provide Order ID and Order Date");
      return;
    }
    const newSample = {
      id: 'sample_' + Math.random().toString(36).substring(2, 11),
      platform: samplePlatform,
      cost: sampleCost,
      orderId: sampleOrderId,
      orderDate: sampleOrderDate
    };
    
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      sampleDetails: [...(n.sampleDetails || []), newSample]
    } : n));
    
    setAddingSampleToNoteId(null);
    setSamplePlatform('PTG');
    setSampleCost('');
    setSampleOrderId('');
    setSampleOrderDate('');
  };

  const handleDeleteSample = (noteId: string, sampleId: string) => {
    if (confirm("Are you sure you want to delete this sample record?")) {
      setNotes(prev => prev.map(n => n.id === noteId ? {
        ...n,
        sampleDetails: (n.sampleDetails || []).filter(s => s.id !== sampleId)
      } : n));
    }
  };
`;

code = code.replace("const [addressBookSearchQuery, setAddressBookSearchQuery] = useState<string>('');", "const [addressBookSearchQuery, setAddressBookSearchQuery] = useState<string>('');" + newStates);

fs.writeFileSync('src/components/SmartAINotebook.tsx', code);
