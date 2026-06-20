'use client';

import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewPopupProps {
  isSubmitting: boolean;
  onSubmit: (data: {
    rating: number;
    foodRating?: number;
    serviceRating?: number;
    ambienceRating?: number;
    quickTags: string[];
    feedback: string;
  }) => void;
  onSkip: () => void;
}

const QUICK_TAGS = [
  'Great Food',
  'Fast Service',
  'Friendly Staff',
  'Clean Environment',
  'Value For Money'
];

export default function ReviewPopup({ isSubmitting, onSubmit, onSkip }: ReviewPopupProps) {
  const [rating, setRating] = useState(0);
  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [ambienceRating, setAmbienceRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = () => {
    if (rating === 0) return;
    onSubmit({
      rating,
      foodRating: foodRating > 0 ? foodRating : undefined,
      serviceRating: serviceRating > 0 ? serviceRating : undefined,
      ambienceRating: ambienceRating > 0 ? ambienceRating : undefined,
      quickTags: selectedTags,
      feedback
    });
  };

  // Helper to render star rating row
  const renderStars = (
    label: string, 
    value: number, 
    setter: (val: number) => void,
    isLarge: boolean = false
  ) => (
    <div className="flex justify-between items-center w-full">
      <span className={cn("text-gray-800 font-semibold", isLarge ? "text-base" : "text-sm")}>{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setter(star)}
            className="p-1 transition-transform active:scale-90 focus:outline-none"
          >
            <Star
              size={isLarge ? 32 : 24}
              className={star <= value ? "text-yellow-400 fill-yellow-400" : "text-stone-200"}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4 sm:p-0">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50">
          <div>
            <h2 className="text-xl font-black text-gray-900">Rate Your Experience</h2>
            <p className="text-xs text-stone-500 mt-1">Help us improve our service</p>
          </div>
          <button 
            onClick={onSkip}
            className="p-2 bg-white rounded-full text-stone-400 shadow-sm hover:text-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-8 bg-white">
          
          {/* Main Rating */}
          <div className="space-y-3 pb-6 border-b border-stone-100">
            {renderStars("Overall Experience", rating, setRating, true)}
          </div>

          {rating > 0 && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-8">
              
              {/* Optional Sub-Ratings */}
              <div className="space-y-4">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detailed Ratings (Optional)</p>
                <div className="space-y-3 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                  {renderStars("Food Quality", foodRating, setFoodRating)}
                  {renderStars("Service Speed", serviceRating, setServiceRating)}
                  {renderStars("Ambience", ambienceRating, setAmbienceRating)}
                </div>
              </div>

              {/* Quick Tags */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">What did you like?</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TAGS.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-semibold transition-colors border",
                        selectedTags.includes(tag)
                          ? "bg-emerald-100 border-emerald-200 text-emerald-800"
                          : "bg-white border-stone-200 text-gray-600 hover:border-emerald-200"
                      )}
                    >
                      {selectedTags.includes(tag) ? `✓ ${tag}` : tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Additional Comments</p>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us more about your visit..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all min-h-[100px] resize-none"
                />
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-100 bg-white grid grid-cols-2 gap-3">
          <button
            onClick={onSkip}
            className="w-full py-4 rounded-xl font-bold text-sm text-stone-500 bg-stone-100 hover:bg-stone-200 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
            className="w-full py-4 rounded-xl font-bold text-sm text-white bg-emerald-800 shadow hover:bg-emerald-900 transition-colors disabled:opacity-50 disabled:bg-stone-300 flex items-center justify-center"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>

      </div>
    </div>
  );
}
