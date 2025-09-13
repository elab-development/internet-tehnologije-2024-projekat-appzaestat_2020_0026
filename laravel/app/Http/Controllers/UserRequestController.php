<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserRequestResource;
use App\Models\UserRequest;
use Illuminate\Http\Request;

class UserRequestController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $user = auth()->user();

        if ($user->role === 'admin') {
            $requests = UserRequest::all();
        } else {
            $requests = UserRequest::where('user_id', $user->id)
                ->get();
        }

        if (is_null($requests) || count($requests) === 0) {
            return response()->json('No requests found!', 404);
        }
        return response()->json([
            'requests' => UserRequestResource::collection($requests),
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
        if (auth()->user()->role !== 'user') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'service_id' => 'required|exists:services,id',
        ]);

        $userRequest = UserRequest::create([
            'user_id' => auth()->id(),
            'service_id' => $validated['service_id'],
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Request submitted successfully',
            'request' =>  new UserRequestResource($userRequest)
        ]);
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $userRequest = UserRequest::find($id);
        $user = auth()->user();

        if ($user->role !== 'admin' && $userRequest->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        return response()->json([
            'request' => new UserRequestResource($userRequest)
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(UserRequest $userRequest)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, UserRequest $userRequest)
    {
        if (auth()->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|string|in:pending,in-progress,completed,rejected',
        ]);

        $userRequest->update($validated);

        return response()->json([
            'message' => 'Requests status updated successfully',
            'request' =>  new UserRequestResource($userRequest)
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(UserRequest $userRequest)
    {
        $user = auth()->user();

        if ($user->role !== 'admin' && $userRequest->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $userRequest->delete();

        return response()->json(['message' => 'Request deleted']);
    }
}
