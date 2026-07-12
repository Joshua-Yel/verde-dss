import React from 'react';

export default function Loading() {
  // You can add any UI inside Loading, including a Skeleton.
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
      Loading overview data...
    </div>
  );
}