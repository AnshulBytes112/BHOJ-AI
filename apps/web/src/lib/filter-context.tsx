'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface FilterContextValue {
  filterDate: string;
  filterTime: string;
  setFilterDate: (v: string) => void;
  setFilterTime: (v: string) => void;
}

const FilterContext = createContext<FilterContextValue>({
  filterDate: '',
  filterTime: '',
  setFilterDate: () => {},
  setFilterTime: () => {},
});

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filterDate, setFilterDate] = useState('');
  const [filterTime, setFilterTime] = useState('');

  useEffect(() => {
    const now = new Date();
    setFilterDate(now.toISOString().split('T')[0]);
    setFilterTime(now.toTimeString().slice(0, 5));
  }, []);

  return (
    <FilterContext.Provider value={{ filterDate, filterTime, setFilterDate, setFilterTime }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  return useContext(FilterContext);
}
