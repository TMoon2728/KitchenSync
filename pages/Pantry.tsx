
import React, { useState } from 'react';
import type { PantryItem } from '../types';

interface PantryProps {
    pantry: PantryItem[];
    setPantry: React.Dispatch<React.SetStateAction<PantryItem[]>>;
}

const Pantry: React.FC<PantryProps> = ({ pantry, setPantry }) => {
    
    const handleUpdate = (id: number, field: 'quantity' | 'unit', value: string | number) => {
        setPantry(pantry.map(item => item.id === id ? { ...item, [field]: value } : item));
    };
    
    const handleDelete = (id: number) => {
        setPantry(pantry.filter(item => item.id !== id));
    };

    // Inline editable field component
    const EditableField: React.FC<{item: PantryItem, field: 'quantity' | 'unit'}> = ({ item, field }) => {
        const [isEditing, setIsEditing] = useState(false);
        const [value, setValue] = useState(item[field]);

        const handleBlur = () => {
            setIsEditing(false);
            if (value !== item[field]) {
                handleUpdate(item.id, field, value);
            }
        };

        if (isEditing) {
            return (
                <input
                    type={field === 'quantity' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) => setValue(field === 'quantity' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                    autoFocus
                    className="form-input p-1 border border-blue-400 rounded-md w-24"
                />
            );
        }
        return <span onClick={() => setIsEditing(true)} className="cursor-pointer hover:bg-gray-200 p-1 rounded-md">{item[field]}</span>;
    };


    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">My Pantry</h1>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h2 className="text-xl font-bold mb-4">Current Inventory</h2>
                {pantry.length > 0 ? (
                    <ul className="space-y-3">
                        {pantry.map(item => (
                            <li key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                <span className="font-semibold">{item.name}</span>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <EditableField item={item} field="quantity" />
                                        <EditableField item={item} field="unit" />
                                    </div>
                                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700">
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 py-8">Your pantry is empty.</p>
                )}
            </div>
        </div>
    );
};

export default Pantry;
