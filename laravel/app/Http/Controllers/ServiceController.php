<?php

namespace App\Http\Controllers;

use App\Http\Resources\ServiceResource;
use App\Models\Service;
use Illuminate\Http\Request;

class ServiceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $services = Service::all();
        if (is_null($services) || count($services) === 0) {
            return response()->json('No services found!', 404);
        }
        return response()->json([
            'services' => ServiceResource::collection($services),
        ]);
    }

    public function searchServices(Request $request)
    {
        $query = $request->query('query');

        if (!$query) {
            return response()->json(['error' => 'Search query is required'], 400);
        }

        $services = Service::where('title', 'like', '%' . $query . '%')
            ->orWhere('description', 'like', '%' . $query . '%')
            ->orWhere('processing_time', 'like', '%' . $query . '%')
            ->get();

        return response()->json([
            'services' => ServiceResource::collection($services),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255|unique:services',
            'description' => 'nullable|string',
            'processing_time' => 'required|string|max:50',
            'fee' => 'required|numeric|min:0',
        ]);

        $service = Service::create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'processing_time' => $validated['processing_time'],
            'fee' => $validated['fee'],
        ]);

        return response()->json([
            'message' => 'Service created successfully',
            'service' =>  new ServiceResource($service)
        ]);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $service = Service::find($id);
        if (is_null($service)) {
            return response()->json('Service not found', 404);
        }
        return response()->json([
            'service' => new ServiceResource($service)
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Service $service)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Service $service)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'processing_time' => 'required|string|max:50',
            'fee' => 'required|numeric|min:0',
        ]);

        $service->update($validated);

        return response()->json([
            'message' => 'Service updated successfully',
            'service' =>  new ServiceResource($service)
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Service $service)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $service->delete();
        return response()->json(['message' => 'Service deleted successfully']);
    }
}
